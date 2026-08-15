import {
    getUnclassifiedEmails,
    updateEmailClassification,
    markEmailClassificationFailed,
    markEmailIgnored,
    attributeEmailToCustomer,
} from "@/services/server/emailService";
import { classifyEmail } from "@/services/server/emailClassificationService";
import { evaluateEmailRelevance } from "@/lib/emailRelevanceGate";
import { matchPaymentEmail } from "@/services/server/paymentEmailMatchingService";
import { persistPaymentDecision } from "@/services/server/paymentDecisionService";
import {
    logActivity,
    logInvoiceActivity,
} from "@/services/server/activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";
import { handleCollectionRelevantEmail } from "@/services/server/collectionCaseOrchestrationService";

// Responsibility #3 (Collections & Follow-Up) classifications — every
// value here except payment_received (owned entirely by the existing
// pipeline above) and other/irrelevant (no case effect at all, per the
// approved design). Kept local to this file since it is purely a
// dispatch list, not a shared type.
const COLLECTION_RELEVANT_CLASSIFICATIONS = new Set([
    "payment_promise",
    "dispute",
    "payment_blocker",
    "reminder_response",
    "customer_inquiry",
    "invoice_related",
]);

const DEFAULT_BATCH_SIZE = 10;

export interface EmailProcessingFailure {
    emailId: string;
    error: string;
}

export interface EmailProcessingResult {
    attempted: number;
    classified: number;
    ignored: number;
    failed: number;
    classifiedEmailIds: string[];
    ignoredEmailIds: string[];
    failures: EmailProcessingFailure[];
}

// The single implementation of "AR relevance gate -> classify -> payment
// decision" for emails in processing_status='received'. Shared by
// POST /api/emails/classify (manual/standalone trigger) and
// POST /api/gmail/sync (which now runs this automatically right after
// a sync), so the two never drift into two different pipelines.
//
// Idempotent/safe to call repeatedly or concurrently in overlapping
// runs: getUnclassifiedEmails() only ever selects processing_status=
// 'received' rows, and every row this function touches is moved out of
// that status (to 'ignored', 'processed', or 'failed') before the next
// email is considered — already processed/ignored/failed emails are
// never re-selected, so re-running this never reprocesses them.
export async function processUnclassifiedEmails(
    batchSize: number = DEFAULT_BATCH_SIZE
): Promise<EmailProcessingResult> {
    const emails = await getUnclassifiedEmails(batchSize);

    const classifiedIds: string[] = [];
    const ignoredIds: string[] = [];

    const failures: EmailProcessingFailure[] = [];

    for (const email of emails) {
        try {
            // AR relevance gate: deterministic-only, conservative
            // (uncertain always passes through). Runs BEFORE
            // classifyEmail() so obviously irrelevant mail
            // (newsletters, marketing, recruiting, spam) never costs
            // an LLM classification call.
            const relevance = evaluateEmailRelevance({
                fromEmail: email.from_email,
                subject: email.subject,
                textBody: email.text_body,
            });

            if (!relevance.relevant) {
                await markEmailIgnored(email.id);

                console.log(
                    "Email Relevance Gate - Ignored:",
                    email.id,
                    relevance.reason
                );

                ignoredIds.push(email.id);

                continue;
            }

            const result = await classifyEmail({
                subject: email.subject,
                textBody: email.text_body,
            });

            await updateEmailClassification(
                email.id,
                result.classification,
                result.confidence
            );

            classifiedIds.push(email.id);

            // Payment-decision side effect is isolated from
            // classification itself: classification has already
            // succeeded and been persisted above, so a failure here
            // must never roll it back or mark the email failed. This
            // never executes a payment — it only ever produces a
            // durable, unapproved proposal via persistPaymentDecision().
            if (result.classification === "payment_received") {
                // Discovery event only: the employee has determined an
                // incoming email CLAIMS a payment was made — nothing
                // more. Never implies verified/confirmed/recorded. Its
                // own try/catch, separate from the matching attempt
                // below, so a logging failure here can never prevent
                // matching/persistPaymentDecision() from running.
                try {
                    await logActivity({
                        activityType: ActivityTypes.PAYMENT_CLAIM_RECEIVED,
                        description: `Received a payment claim from ${email.from_email}`,
                        metadata: {
                            fromEmail: email.from_email,
                            subject: email.subject,
                            receivedAt: email.received_at,
                            confidence: result.confidence,
                        },
                    });
                } catch (activityError) {
                    console.error(
                        "Activity Log - payment_claim_received failed for email:",
                        email.id,
                        activityError
                    );
                }

                try {
                    const matchResult = await matchPaymentEmail({
                        subject: email.subject,
                        textBody: email.text_body,
                        fromEmail: email.from_email,
                        receivedAt: email.received_at,
                    });

                    // Deterministic customer linkage — mirrors
                    // handleCollectionRelevantEmail's attribution for
                    // every other collection-relevant classification.
                    // matchPaymentEmail() resolves customerId (by exact
                    // sender-email match) for BOTH "ready" and most
                    // "needs_review" outcomes; only customer_not_found
                    // leaves it null. Without this, a customer's "I
                    // already paid" reply never appears in that
                    // customer's collection case communication history
                    // (getCollectionCaseDetail() joins on emails.
                    // customer_id) even though a customer was
                    // deterministically identified. Own try/catch so a
                    // failure here can never block persistPaymentDecision()
                    // below — that write remains the load-bearing one.
                    if (matchResult.customerId) {
                        try {
                            await attributeEmailToCustomer(
                                email.id,
                                matchResult.customerId
                            );
                        } catch (attributionError) {
                            console.error(
                                "Email Attribution - payment_received failed for email:",
                                email.id,
                                attributionError
                            );
                        }
                    }

                    // Structural match only — customer/invoice/amount
                    // are internally consistent, not bank-confirmed.
                    // Its own try/catch so a logging failure can never
                    // prevent persistPaymentDecision() below from
                    // running for either a "ready" or "needs_review"
                    // result — that write is the load-bearing one.
                    if (matchResult.status === "ready") {
                        try {
                            await logInvoiceActivity(
                                matchResult.invoiceId,
                                matchResult.customerId,
                                ActivityTypes.PAYMENT_CLAIM_MATCHED,
                                `Payment claim matched to invoice ${matchResult.invoiceNumber}`,
                                {
                                    amount: matchResult.amount,
                                    currency: matchResult.currency,
                                    invoiceNumber: matchResult.invoiceNumber,
                                    paymentDate:
                                        matchResult.paymentDate.toISOString(),
                                    paymentReference:
                                        matchResult.paymentReference,
                                    confidence: matchResult.confidence,
                                }
                            );
                        } catch (activityError) {
                            console.error(
                                "Activity Log - payment_claim_matched failed for email:",
                                email.id,
                                activityError
                            );
                        }
                    }

                    await persistPaymentDecision(
                        email.id,
                        matchResult
                    );
                } catch (paymentError) {
                    console.error(
                        "Payment Decision - Failed for email:",
                        email.id,
                        paymentError
                    );
                }
            } else if (
                COLLECTION_RELEVANT_CLASSIFICATIONS.has(result.classification)
            ) {
                // Responsibility #3 (Collections & Follow-Up) side
                // effect — isolated exactly like the payment_received
                // branch above: classification has already succeeded
                // and been persisted, so a failure here must never roll
                // it back or mark the email failed. Requires
                // gmail_message_id/gmail_thread_id (present on every
                // Gmail-sourced row) to reply in-thread for
                // acknowledgment-type decisions.
                if (email.gmail_message_id && email.gmail_thread_id) {
                    try {
                        await handleCollectionRelevantEmail({
                            id: email.id,
                            subject: email.subject,
                            text_body: email.text_body,
                            from_email: email.from_email,
                            classification: result.classification,
                            classification_confidence: result.confidence,
                            gmail_message_id: email.gmail_message_id,
                            gmail_thread_id: email.gmail_thread_id,
                        });
                    } catch (collectionError) {
                        console.error(
                            "Collection Case Handling - Failed for email:",
                            email.id,
                            collectionError
                        );
                    }
                }
            }
        } catch (error) {
            console.error(
                "Email Classification - Message Failed:",
                email.id,
                error
            );

            await markEmailClassificationFailed(email.id);

            failures.push({
                emailId: email.id,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            });
        }
    }

    return {
        attempted: emails.length,
        classified: classifiedIds.length,
        ignored: ignoredIds.length,
        failed: failures.length,
        classifiedEmailIds: classifiedIds,
        ignoredEmailIds: ignoredIds,
        failures,
    };
}
