import { supabase } from "@/lib/supabase";
import { sendGmailReply } from "@/lib/gmail/send";
import { getOriginalMessageMetadata } from "@/lib/gmail/messages";
import { ActivityTypes, type ActivityType } from "@/lib/activityTypes";
import { logActivity } from "./activityLogService";
import { logEmployeeActivity } from "../EmployeeActivityService";
import { getOverdueInvoiceDetail } from "./receivablesMonitoringService";
import { findCustomerByEmailSafe } from "./customerService";
import { normalizeFromEmail } from "./paymentEmailMatchingService";
import { attributeEmailToCustomer } from "./emailService";
import { extractPromiseDetails } from "./promisePaymentExtractionService";
import { extractExceptionDetails } from "./collectionExceptionExtractionService";
import {
    composeInitialContactEmail,
    composeFollowUpEmail,
    composeBlockerCheckInEmail,
    composeDisputeAcknowledgmentEmail,
    composePromiseAcknowledgmentEmail,
    type ExposureSummary,
} from "./collectionEmailComposer";
import {
    getActiveCaseForCustomer,
    openCollectionCase,
    claimCaseForEvaluation,
    applyCaseTransition,
    resolveCollectionCase,
    toCaseState,
    type OutboundThreadPatch,
    type CollectionCaseRow,
} from "./collectionCaseService";
import {
    evaluateCollectionCase,
    type AssessmentContext,
    type CaseStatus,
    type CollectionDecisionResult,
    type InsightContext,
    type LatestResponse,
    type LatestResponseClassification,
} from "./collectionDecisionEngine";

// ---------------------------------------------------------------------
// Responsibility #3 (Collections & Follow-Up) — the orchestration
// layer: the only place that fetches live #1/#2 data, calls the pure
// decision engine, executes the resulting composer/send, persists the
// result, and logs it. collectionDecisionEngine.ts itself never touches
// any of this — see that file's own header for why.
//
// Single entry point (evaluateOrOpenCollectionCase) is called from
// every trigger site: processingengine.ts's after() block, paymentService.ts's
// recordPayment() chain, the /api/collection-cases/backfill sweep, and
// (via handleCollectionRelevantEmail below) emailProcessingService.ts's
// classification loop.
// ---------------------------------------------------------------------

interface AssessmentRow {
    assessment: AssessmentContext["assessment"];
    priority: AssessmentContext["priority"];
    evidence: { outstandingAmount?: number } | null;
}

async function readAssessment(
    customerId: string
): Promise<{ context: AssessmentContext; snapshot: Record<string, unknown> } | null> {
    const { data, error } = await supabase
        .from("customer_receivables_assessments")
        .select("assessment, priority, severity, deviation, reason, evidence")
        .eq("customer_id", customerId)
        .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const row = data as unknown as AssessmentRow & {
        severity: string;
        deviation: string;
        reason: string;
    };

    const hasOutstanding = Number(row.evidence?.outstandingAmount ?? 0) > 0;

    return {
        context: {
            assessment: row.assessment,
            priority: row.priority,
            hasOutstanding,
        },
        snapshot: {
            assessment: row.assessment,
            priority: row.priority,
            severity: row.severity,
            deviation: row.deviation,
            reason: row.reason,
        },
    };
}

async function readInsight(customerId: string): Promise<InsightContext> {
    const { data, error } = await supabase
        .from("customer_insights")
        .select("risk_level")
        .eq("customer_id", customerId)
        .maybeSingle();

    if (error) throw error;

    return { riskLevel: data?.risk_level ?? "unknown" };
}

async function hasPendingPaymentDecision(
    customerId: string
): Promise<boolean> {
    const { count, error } = await supabase
        .from("payment_decisions")
        .select("*", { head: true, count: "exact" })
        .eq("customer_id", customerId)
        .eq("status", "pending");

    if (error) throw error;

    return (count ?? 0) > 0;
}

interface CustomerContact {
    companyName: string;
    contactName: string | null;
    email: string | null;
}

async function getCustomerContact(
    customerId: string
): Promise<CustomerContact> {
    const { data, error } = await supabase
        .from("customers")
        .select("company_name, contact_name, email")
        .eq("id", customerId)
        .maybeSingle();

    if (error) throw error;

    return {
        companyName: data?.company_name ?? "there",
        contactName: data?.contact_name ?? null,
        email: data?.email ?? null,
    };
}

async function buildExposureSummary(
    customerId: string
): Promise<ExposureSummary> {
    const detail = await getOverdueInvoiceDetail(customerId);

    return {
        outstandingAmount: detail.outstandingAmount,
        overdueAmount: detail.overdueAmount,
        overdueInvoiceCount: detail.overdueInvoiceCount,
        maxDaysOverdue: detail.maxDaysOverdue,
        currency: detail.currency,
    };
}

async function findTriggeringInvoiceId(
    customerId: string
): Promise<string | null> {
    const { data, error } = await supabase
        .from("invoices")
        .select("id, due_date, balance_due, status")
        .eq("customer_id", customerId)
        .in("status", ["pending", "partial"])
        .gt("balance_due", 0)
        .order("due_date", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    return data?.id ?? null;
}

export interface ReplySource {
    gmailMessageId: string;
    gmailThreadId: string;
    fromEmail: string;
    subject: string | null;
}

export interface EvaluateOrOpenOptions {
    latestResponse?: LatestResponse;
    triggeredByPayment?: boolean;
    replySource?: ReplySource;
}

// -----------------------------------------------------------------
// Sending — separated from composing (collectionEmailComposer.ts) per
// the approved design. Fresh, un-threaded email for proactive outreach
// (contact/follow_up/check_in); same-thread reply for reply-triggered
// acknowledgments (acknowledge_promise/acknowledge_exception), mirroring
// paymentProofRequestService.ts's exact RFC Message-ID threading.
// -----------------------------------------------------------------

export interface OutboundThreadAnchor {
    messageId: string;
    threadId: string | null;
}

// Threads onto the case's own last outbound message when one exists
// (`anchor` — collection_cases.last_outbound_gmail_message_id/
// last_outbound_gmail_thread_id, resolved by the caller), otherwise
// sends a fresh email exactly as before (a case's first-ever `contact`
// always has no anchor). Unlike sendReplyOutreach() below — which MUST
// reply to a specific inbound email and therefore throws when its RFC
// Message-ID is unavailable — a missing/unreadable header here only
// degrades this one send back to a fresh thread rather than blocking
// the outreach itself: continuing the existing thread is a continuity
// improvement, not the load-bearing part of this responsibility (the
// send is). A genuine failure to fetch the anchor message at all (vs.
// the header being merely absent) still propagates, exactly like every
// other failure in executeOutreach() — caught by the outer try/catch in
// evaluateOrOpenCollectionCase, case state left unchanged, retried later.
// Exported for direct unit testing of the anchor-present vs.
// anchor-absent branches without mocking the full evaluation loop.
export async function sendProactiveOutreach(
    to: string,
    composed: { subject: string; body: string },
    anchor: OutboundThreadAnchor | null
): Promise<{ messageId: string; threadId: string | null }> {
    if (!anchor) {
        return sendGmailReply({ to, subject: composed.subject, body: composed.body });
    }

    const metadata = await getOriginalMessageMetadata(anchor.messageId);

    if (!metadata.rfcMessageId) {
        return sendGmailReply({ to, subject: composed.subject, body: composed.body });
    }

    return sendGmailReply({
        to,
        subject: composed.subject,
        body: composed.body,
        threadId: anchor.threadId ?? undefined,
        inReplyTo: metadata.rfcMessageId,
        references: metadata.rfcMessageId,
    });
}

async function sendReplyOutreach(
    replySource: ReplySource,
    composed: { subject: string; body: string }
): Promise<{ messageId: string; threadId: string | null }> {
    const metadata = await getOriginalMessageMetadata(
        replySource.gmailMessageId
    );

    if (!metadata.rfcMessageId) {
        throw new Error(
            "The original email has no RFC Message-ID header; cannot safely reply in the same thread."
        );
    }

    return sendGmailReply({
        to: replySource.fromEmail,
        subject: composed.subject,
        body: composed.body,
        threadId: replySource.gmailThreadId,
        inReplyTo: metadata.rfcMessageId,
        references: metadata.rfcMessageId,
    });
}

// -----------------------------------------------------------------
// Core evaluation loop.
// -----------------------------------------------------------------

export async function evaluateOrOpenCollectionCase(
    customerId: string,
    options: EvaluateOrOpenOptions = {}
): Promise<void> {
    const { latestResponse = null, triggeredByPayment = false, replySource } =
        options;

    const assessmentResult = await readAssessment(customerId);

    // Responsibility #2 hasn't produced an assessment for this customer
    // yet — nothing for #3 to act on; the next background/backfill pass
    // picks it up once it has. Same no-op convention as
    // refreshReceivablesAssessment()'s own "no customer_insights yet" case.
    if (!assessmentResult) return;

    const { context: assessment, snapshot } = assessmentResult;

    let existing = await getActiveCaseForCustomer(customerId);

    if (!existing) {
        if (!assessment.hasOutstanding) return;

        if (
            assessment.assessment !== "needs_attention" &&
            assessment.assessment !== "critical"
        ) {
            return;
        }

        const triggeringInvoiceId = await findTriggeringInvoiceId(customerId);

        existing = await openCollectionCase(
            customerId,
            snapshot,
            triggeringInvoiceId
        );

        await logActivity({
            customerId,
            activityType: ActivityTypes.COLLECTION_CASE_OPENED,
            description: `Collection case opened for ${assessment.assessment} customer (${assessment.priority} priority).`,
            metadata: { caseId: existing.id, ...snapshot },
        });

        await logEmployeeActivity({
            activityType: "collection_case_opened",
            message: `Collection case opened · ${assessment.priority} priority`,
        });
    }

    // Universal resolution gate — checked independently of, and BEFORE,
    // the claim/evaluate pipeline below, so it applies even to an
    // escalated case (the sole autonomous exit from status='escalated').
    if (!assessment.hasOutstanding) {
        const resolved = await resolveCollectionCase(
            customerId,
            triggeredByPayment ? "resolved_paid" : "resolved_no_exposure"
        );

        if (resolved) {
            await logActivity({
                customerId,
                activityType: ActivityTypes.COLLECTION_CASE_RESOLVED,
                description:
                    triggeredByPayment
                        ? "Collection case resolved — payment received."
                        : "Collection case resolved — no remaining outstanding balance.",
                metadata: { caseId: resolved.id },
            });

            await logEmployeeActivity({
                activityType: "collection_case_resolved",
                message: "Collection case resolved",
            });
        }

        return;
    }

    // Escalated cases are human-owned — no autonomous evaluation beyond
    // the resolution check above.
    if (existing.status === "escalated") return;

    // Optimistic-lock compare-and-swap against the exact value just
    // read above (`existing`) — see claimCaseForEvaluation()'s own doc
    // comment for why this must not require next_evaluation_at <= now.
    const claimed = await claimCaseForEvaluation(
        existing.id,
        new Date(existing.next_evaluation_at)
    );

    if (!claimed) return; // concurrently claimed by another evaluation pass

    const insight = await readInsight(customerId);
    const pendingPaymentDecision = await hasPendingPaymentDecision(customerId);

    // caseState.nextEvaluationAt must be the REAL prior schedule
    // (`existing`, read before the claim), never `claimed`'s own
    // next_evaluation_at — the claim just overwrote that to its
    // temporary +1h lock timestamp, which is not a fact about the case,
    // only about the claim itself. Every other field is unaffected by
    // the claim (it only ever touches next_evaluation_at/updated_at),
    // so toCaseState(claimed) is otherwise correct as-is.
    const caseState = {
        ...toCaseState(claimed),
        nextEvaluationAt: new Date(existing.next_evaluation_at),
    };

    const result = evaluateCollectionCase({
        caseState,
        assessment,
        insight,
        pendingPaymentDecision,
        latestResponse,
        now: new Date(),
        triggeredByPayment,
    });

    if (result.outreachContext) {
        const contact = await getCustomerContact(customerId);

        const threadAnchor: OutboundThreadAnchor | null =
            claimed.last_outbound_gmail_message_id
                ? {
                      messageId: claimed.last_outbound_gmail_message_id,
                      threadId: claimed.last_outbound_gmail_thread_id,
                  }
                : null;

        try {
            const sendResult = await executeOutreach(
                result.outreachContext,
                contact,
                customerId,
                replySource,
                threadAnchor
            );

            // Same atomic UPDATE as the decision-engine's own field
            // patch — see OutboundThreadPatch's doc comment in
            // collectionCaseService.ts for why this must never be a
            // separate write (a send that succeeds but whose
            // persistence fails must retry exactly like any other
            // applyCaseTransition failure today, never resend).
            const outboundThread: OutboundThreadPatch = {
                lastOutboundGmailMessageId: sendResult.messageId,
                lastOutboundGmailThreadId: sendResult.threadId,
            };

            await applyCaseTransition(
                claimed.id,
                claimed.status,
                result.fieldPatch,
                outboundThread
            );

            await logOutreachActivity(customerId, claimed.id, result, sendResult);

            if (
                isExceptionResolved(
                    result.fieldPatch,
                    claimed.exception_category !== null
                )
            ) {
                await logExceptionResolvedActivity(customerId, claimed);
            }
        } catch (error) {
            // The load-bearing action (the send, or building its content)
            // failed — never advance case state or log a sent message
            // for an email that was never sent. The claim's soft lock
            // naturally expires (see claimCaseForEvaluation), so the
            // next sweep retries.
            console.error(
                "Collection Case Orchestration - outreach failed, case state left unchanged:",
                claimed.id,
                error
            );
        }

        return;
    }

    // No outreach required for this decision (wait/escalate/resolve) —
    // persist directly.
    await applyCaseTransition(claimed.id, claimed.status, result.fieldPatch);

    if (result.decision === "escalate") {
        await logActivity({
            customerId,
            activityType: ActivityTypes.COLLECTION_CASE_ESCALATED,
            description: result.reason,
            metadata: { caseId: claimed.id, ...result.evidence },
        });

        await logEmployeeActivity({
            activityType: "collection_case_escalated",
            message: `Collection case escalated · ${result.priority} priority`,
        });
    } else if (result.decision === "resolve") {
        await logActivity({
            customerId,
            activityType: ActivityTypes.COLLECTION_CASE_RESOLVED,
            description: result.reason,
            metadata: { caseId: claimed.id },
        });

        await logEmployeeActivity({
            activityType: "collection_case_resolved",
            message: "Collection case resolved",
        });

        if (
            isExceptionResolved(
                result.fieldPatch,
                claimed.exception_category !== null
            )
        ) {
            await logExceptionResolvedActivity(customerId, claimed);
        }
    } else if (isNewBlockerOpened(result, claimed.status)) {
        // T9, accepted blocker — a silent "wait" decision (chasing is
        // paused per the approved v2 design; no acknowledgment email is
        // sent), but the blocker being opened is still a real event
        // that must be reconstructable from activity_log alone.
        await logActivity({
            customerId,
            activityType: ActivityTypes.COLLECTION_BLOCKER_OPENED,
            description: result.reason,
            metadata: { caseId: claimed.id, ...result.evidence },
        });

        await logEmployeeActivity({
            activityType: "collection_blocker_opened",
            message: "Blocker reported; chasing paused",
        });
    }
    // Every other 'wait' decision is deliberately not logged to
    // activity_log — see this file's design notes: logging every no-op
    // re-evaluation would flood the audit trail with "still waiting"
    // rows every backfill cycle, unlike every event above which
    // represents something actually happening.
}

async function logExceptionResolvedActivity(
    customerId: string,
    claimed: CollectionCaseRow
): Promise<void> {
    try {
        await logActivity({
            customerId,
            activityType: ActivityTypes.COLLECTION_EXCEPTION_RESOLVED,
            description: `${claimed.exception_category === "dispute" ? "Dispute" : "Blocker"} resolved.`,
            metadata: {
                caseId: claimed.id,
                exceptionCategory: claimed.exception_category,
                exceptionType: claimed.exception_type,
            },
        });
    } catch (activityError) {
        // Mirrors logOutreachActivity's isolation — the load-bearing
        // action (the case transition this accompanies) already
        // succeeded; a logging failure here must never be reported as
        // that action failing.
        console.error(
            "Collection Case Orchestration - exception resolved but activity logging failed:",
            claimed.id,
            activityError
        );
    }
}

export interface ExecuteOutreachResult {
    messageId: string;
    threadId: string | null;
    composed: { subject: string; body: string };
}

async function executeOutreach(
    outreachContext: NonNullable<
        ReturnType<typeof evaluateCollectionCase>["outreachContext"]
    >,
    contact: CustomerContact,
    customerId: string,
    replySource: ReplySource | undefined,
    threadAnchor: OutboundThreadAnchor | null
): Promise<ExecuteOutreachResult> {
    switch (outreachContext.kind) {
        case "contact": {
            if (!contact.email) {
                throw new Error(
                    `Customer ${customerId} has no email on file; cannot send outreach.`
                );
            }

            const exposure = await buildExposureSummary(customerId);

            const composed = composeInitialContactEmail({
                customerName: contact.contactName ?? contact.companyName,
                exposure,
            });

            const sent = await sendProactiveOutreach(contact.email, composed, threadAnchor);
            return { ...sent, composed };
        }

        case "follow_up": {
            if (!contact.email) {
                throw new Error(
                    `Customer ${customerId} has no email on file; cannot send outreach.`
                );
            }

            const exposure = await buildExposureSummary(customerId);

            const composed = composeFollowUpEmail({
                customerName: contact.contactName ?? contact.companyName,
                exposure,
                missedCommitment: outreachContext.missedCommitment,
            });

            const sent = await sendProactiveOutreach(contact.email, composed, threadAnchor);
            return { ...sent, composed };
        }

        case "check_in": {
            if (!contact.email) {
                throw new Error(
                    `Customer ${customerId} has no email on file; cannot send outreach.`
                );
            }

            const composed = composeBlockerCheckInEmail({
                customerName: contact.contactName ?? contact.companyName,
                exceptionDetail: null,
            });

            const sent = await sendProactiveOutreach(contact.email, composed, threadAnchor);
            return { ...sent, composed };
        }

        case "acknowledge_promise": {
            if (!replySource) {
                throw new Error(
                    "acknowledge_promise requires a replySource (the triggering email) to reply in-thread."
                );
            }

            const composed = composePromiseAcknowledgmentEmail({
                customerName: contact.contactName ?? contact.companyName,
                amount: outreachContext.amount,
                currency: outreachContext.currency,
                date: outreachContext.date,
                originalSubject: replySource.subject,
            });

            const sent = await sendReplyOutreach(replySource, composed);
            return { ...sent, composed };
        }

        case "acknowledge_exception": {
            if (!replySource) {
                throw new Error(
                    "acknowledge_exception requires a replySource (the triggering email) to reply in-thread."
                );
            }

            // Only "dispute" ever reaches this composer — a
            // payment_blocker never produces an outreachContext (its
            // acceptance is a silent "wait" decision, per the approved
            // v2 design: chasing is paused, no acknowledgment is sent).
            const composed = composeDisputeAcknowledgmentEmail({
                customerName: contact.contactName ?? contact.companyName,
                originalSubject: replySource.subject,
            });

            const sent = await sendReplyOutreach(replySource, composed);
            return { ...sent, composed };
        }
    }
}

// Pure — no I/O. Distinguishes a broken-promise-triggered follow_up
// (T19: promise_to_pay -> follow_up, outreachContext.missedCommitment
// is non-null) from an ordinary silence-triggered follow_up
// (evaluateUnresponsive: missedCommitment is always null) so the
// audit trail can tell them apart, without collectionDecisionEngine.ts
// itself needing a third decision value — both remain "follow_up" at
// the decision-engine level (§ approved boundary: #3 has no independent
// authority to invent new decisions).
export function selectOutreachActivityType(
    result: Pick<CollectionDecisionResult, "decision" | "outreachContext">
): ActivityType {
    if (result.decision === "acknowledge_promise") {
        return ActivityTypes.COLLECTION_PROMISE_ACKNOWLEDGED;
    }

    if (result.decision === "acknowledge_exception") {
        return ActivityTypes.COLLECTION_DISPUTE_OPENED;
    }

    if (
        result.decision === "follow_up" &&
        result.outreachContext?.kind === "follow_up" &&
        result.outreachContext.missedCommitment !== null
    ) {
        return ActivityTypes.COLLECTION_PROMISE_BROKEN;
    }

    return ActivityTypes.COLLECTION_OUTREACH_SENT;
}

// Pure — no I/O. True only the FIRST time a case's status transitions
// INTO payment_blocked this evaluation (T9, accepted blocker) — not on
// a later re-statement of the same blocker while already
// status='payment_blocked' (T10/T11 re-evaluate the existing blocker,
// they do not re-open it), so this fires exactly once per blocker.
export function isNewBlockerOpened(
    result: Pick<CollectionDecisionResult, "decision" | "newStatus">,
    previousStatus: CaseStatus
): boolean {
    return (
        result.decision === "wait" &&
        result.newStatus === "payment_blocked" &&
        previousStatus !== "payment_blocked"
    );
}

// Pure — no I/O. True whenever this transition's field patch clears an
// exception that was actually open (a case with no exceptionCategory
// has nothing to resolve) — covers both the universal resolution gate
// (buildResolution, case closes entirely) and T4's promise-accepted-
// while-blocked path (case stays open, only the blocker clears).
export function isExceptionResolved(
    fieldPatch: Pick<CollectionDecisionResult["fieldPatch"], "exceptionStatus">,
    hadExceptionCategory: boolean
): boolean {
    return hadExceptionCategory && fieldPatch.exceptionStatus === "resolved";
}

async function logOutreachActivity(
    customerId: string,
    caseId: string,
    result: ReturnType<typeof evaluateCollectionCase>,
    sendResult: ExecuteOutreachResult
): Promise<void> {
    try {
        const activityType = selectOutreachActivityType(result);

        await logActivity({
            customerId,
            activityType,
            description: result.reason,
            metadata: {
                caseId,
                decision: result.decision,
                gmailMessageId: sendResult.messageId,
                gmailThreadId: sendResult.threadId,
                subject: sendResult.composed.subject,
                body: sendResult.composed.body,
                ...result.evidence,
            },
        });

        await logEmployeeActivity({
            activityType: `collection_${result.decision}`,
            message:
                result.decision === "contact"
                    ? "First outreach sent"
                    : result.decision === "follow_up"
                      ? `Follow-up sent · attempt ${(result.evidence.outreachCount as number | undefined) ?? "?"}`
                      : result.decision === "check_in"
                        ? "Blocker check-in sent"
                        : result.decision === "acknowledge_promise"
                          ? "Payment promise acknowledged"
                          : "Dispute acknowledged, routed for review",
        });
    } catch (activityError) {
        // The email was already sent successfully — a logging failure
        // must never be reported as a send failure, mirrors
        // paymentProofRequestService.ts's identical isolation.
        console.error(
            "Collection Case Orchestration - outreach sent but activity logging failed:",
            caseId,
            activityError
        );
    }
}

// -----------------------------------------------------------------
// Email-driven entry point — the adapter emailProcessingService.ts's
// new branch calls for every collection-relevant classification.
// -----------------------------------------------------------------

export interface CollectionRelevantEmail {
    id: string;
    subject: string | null;
    text_body: string | null;
    from_email: string;
    classification: string;
    classification_confidence: number | null;
    gmail_message_id: string;
    gmail_thread_id: string;
}

export async function handleCollectionRelevantEmail(
    email: CollectionRelevantEmail
): Promise<void> {
    const normalized = normalizeFromEmail(email.from_email);
    const customer = await findCustomerByEmailSafe(normalized);

    // Fail-safe by design: an unattributable or ambiguous sender never
    // guesses a customer and never affects any case.
    if (!customer) return;

    await attributeEmailToCustomer(email.id, customer.id);

    const activeCase = await getActiveCaseForCustomer(customer.id);

    // Emails never OPEN a case — only #2's assessment does. A
    // collection-relevant email for a customer with no active case has
    // no case effect (still recorded/classified on the emails row
    // itself, just not actionable here).
    if (!activeCase) return;

    const classification =
        email.classification as LatestResponseClassification;

    let promiseExtraction: LatestResponse["promiseExtraction"];
    let exceptionExtraction: LatestResponse["exceptionExtraction"];

    if (classification === "payment_promise") {
        const extracted = await extractPromiseDetails({
            subject: email.subject,
            textBody: email.text_body,
        });

        promiseExtraction = extracted;
    } else if (classification === "dispute") {
        const extracted = await extractExceptionDetails({
            subject: email.subject,
            textBody: email.text_body,
            category: "dispute",
        });

        exceptionExtraction = extracted;
    } else if (classification === "payment_blocker") {
        const extracted = await extractExceptionDetails({
            subject: email.subject,
            textBody: email.text_body,
            category: "blocker",
        });

        exceptionExtraction = extracted;
    }

    const latestResponse: LatestResponse = {
        emailId: email.id,
        classification,
        classificationConfidence: email.classification_confidence ?? 0,
        receivedAt: new Date(),
        promiseExtraction,
        exceptionExtraction,
    };

    await evaluateOrOpenCollectionCase(customer.id, {
        latestResponse,
        replySource: {
            gmailMessageId: email.gmail_message_id,
            gmailThreadId: email.gmail_thread_id,
            fromEmail: email.from_email,
            subject: email.subject,
        },
    });
}
