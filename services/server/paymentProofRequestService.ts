import { supabase } from "@/lib/supabase";
import { normalizeFromEmail } from "./paymentEmailMatchingService";
import { getOriginalMessageMetadata } from "@/lib/gmail/messages";
import { sendGmailReply } from "@/lib/gmail/send";
import { composeProofRequestEmail } from "./paymentProofEmailComposer";
import { logActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";

// Thrown by requestPaymentProof() for every "do not send" outcome —
// distinguishable from a generic thrown error (Gmail/DB failures) so the
// API route can respond with a specific, useful reason instead of a bare
// 500. None of these reasons ever mutate the payment_decisions row or
// invoice — see requestPaymentProof()'s own comment for why.
export class RequestProofRejectedError extends Error {
    constructor(
        public readonly reason:
            | "not_found"
            | "not_pending"
            | "missing_customer_email"
            | "missing_original_email"
            | "sender_mismatch"
            | "original_message_fetch_failed"
            | "missing_rfc_message_id",
        message: string
    ) {
        super(message);
        this.name = "RequestProofRejectedError";
    }
}

export interface RequestPaymentProofResult {
    decisionId: string;
    gmailMessageId: string;
    gmailThreadId: string | null;
    recipient: string;
}

interface PaymentDecisionForProofRequestRow {
    id: string;
    status: string;
    customer_id: string | null;
    invoice_id: string | null;
    proposed_amount: number | null;
    proposed_currency: string | null;
    proposed_invoice_number: string | null;
    customers: {
        email: string | null;
        company_name: string | null;
        contact_name: string | null;
    } | null;
    invoices: { invoice_number: string } | null;
    emails: {
        gmail_message_id: string | null;
        gmail_thread_id: string | null;
        from_email: string;
        subject: string | null;
    } | null;
}

async function loadDecisionForProofRequest(
    decisionId: string
): Promise<PaymentDecisionForProofRequestRow | null> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .select(
            `
            id,
            status,
            customer_id,
            invoice_id,
            proposed_amount,
            proposed_currency,
            proposed_invoice_number,
            customers ( email, company_name, contact_name ),
            invoices ( invoice_number ),
            emails ( gmail_message_id, gmail_thread_id, from_email, subject )
        `
        )
        .eq("id", decisionId)
        .maybeSingle();

    if (error) throw error;

    return data as unknown as PaymentDecisionForProofRequestRow | null;
}

// Human-triggered only (see app/api/payment-decisions/[id]/request-proof/
// route.ts) — never called automatically as a side effect of matching or
// classification. Sends a deterministic, same-thread reply asking the
// customer for payment evidence.
//
// Deliberately does NOT approve, execute, create a payment, or mutate the
// invoice/decision in ANY way — a payment_decision is not a payment
// approval (see the payment_decision creation flow in
// paymentEmailMatchingService.ts/paymentDecisionService.ts). The decision
// stays exactly as it was (status='pending') on both success and failure:
// Request Proof asks for more information while the exception remains
// open, it does not resolve it.
//
// Every fact used to build the outbound message is resolved server-side
// from the database/Gmail — customer email, invoice label, original
// subject/thread/message-id — never from a caller-supplied argument beyond
// decisionId, so a client can never influence the recipient or content.
export async function requestPaymentProof(
    decisionId: string
): Promise<RequestPaymentProofResult> {
    const decision = await loadDecisionForProofRequest(decisionId);

    if (!decision) {
        throw new RequestProofRejectedError(
            "not_found",
            `Payment decision ${decisionId} not found`
        );
    }

    if (decision.status !== "pending") {
        throw new RequestProofRejectedError(
            "not_pending",
            `Payment decision ${decisionId} cannot be sent a proof request: status is "${decision.status}", not "pending"`
        );
    }

    const customerEmail = decision.customers?.email?.trim();

    if (!decision.customer_id || !customerEmail) {
        throw new RequestProofRejectedError(
            "missing_customer_email",
            "This payment decision has no valid customer email on file; cannot send a proof request"
        );
    }

    const customerId = decision.customer_id;

    const email = decision.emails;

    if (!email || !email.gmail_message_id || !email.gmail_thread_id) {
        throw new RequestProofRejectedError(
            "missing_original_email",
            "The original customer email could not be resolved; cannot reply in the same thread"
        );
    }

    // Trusted-data cross-check: the stored customer email must correspond
    // to whoever actually sent the original claim, so a proof request can
    // never be sent to an address that isn't the one this conversation
    // came from — regardless of what a client might have supplied (it
    // supplies nothing beyond decisionId, but this also guards against a
    // stale/incorrect customer match).
    if (
        normalizeFromEmail(email.from_email) !==
        normalizeFromEmail(customerEmail)
    ) {
        throw new RequestProofRejectedError(
            "sender_mismatch",
            "The stored customer email does not match the original sender of this claim; cannot safely send a proof request"
        );
    }

    let metadata;

    try {
        metadata = await getOriginalMessageMetadata(email.gmail_message_id);
    } catch (error) {
        throw new RequestProofRejectedError(
            "original_message_fetch_failed",
            `Could not fetch the original Gmail message: ${
                error instanceof Error ? error.message : "Unknown error"
            }`
        );
    }

    if (!metadata.rfcMessageId) {
        throw new RequestProofRejectedError(
            "missing_rfc_message_id",
            "The original email has no RFC Message-ID header; cannot safely reply in the same thread"
        );
    }

    const invoiceLabel =
        decision.invoices?.invoice_number ??
        decision.proposed_invoice_number ??
        "the invoice";

    const { subject, body } = composeProofRequestEmail({
        customerName:
            decision.customers?.contact_name ??
            decision.customers?.company_name ??
            "there",
        invoiceLabel,
        originalSubject: email.subject,
    });

    // Gmail send is the load-bearing action. Everything above is
    // validation (nothing sent, nothing mutated if any of it throws);
    // everything below is best-effort and must never cause a
    // successfully-sent email to be reported as failed, and must never
    // trigger a second send.
    const sendResult = await sendGmailReply({
        to: customerEmail,
        subject,
        body,
        threadId: email.gmail_thread_id,
        inReplyTo: metadata.rfcMessageId,
        references: metadata.rfcMessageId,
    });

    try {
        await logActivity({
            invoiceId: decision.invoice_id,
            customerId,
            activityType: ActivityTypes.PAYMENT_PROOF_REQUESTED,
            description: `Requested payment confirmation from ${
                decision.customers?.company_name ?? "customer"
            }`,
            metadata: {
                customerId,
                invoiceId: decision.invoice_id,
                decisionId: decision.id,
                amount: decision.proposed_amount,
                currency: decision.proposed_currency,
                recipient: customerEmail,
                gmailMessageId: sendResult.messageId,
                gmailThreadId: sendResult.threadId,
            },
        });
    } catch (activityError) {
        // The email was already sent successfully — a logging failure
        // here must never be reported as a send failure, and must never
        // trigger a retry/second send.
        console.error(
            "Request Proof - Gmail send succeeded but activity logging failed:",
            decisionId,
            activityError
        );
    }

    return {
        decisionId: decision.id,
        gmailMessageId: sendResult.messageId,
        gmailThreadId: sendResult.threadId,
        recipient: customerEmail,
    };
}
