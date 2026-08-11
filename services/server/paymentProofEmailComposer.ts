export interface ProofRequestEmailInput {
    customerName: string;
    invoiceLabel: string;
    // The ORIGINAL customer email's subject — this composer only ever
    // derives a "Re: ..." continuation of it, never a fresh subject line.
    originalSubject: string | null;
}

export interface ComposedEmail {
    subject: string;
    body: string;
}

function toReplySubject(
    originalSubject: string | null,
    invoiceLabel: string
): string {
    const trimmed = originalSubject?.trim();

    if (!trimmed) {
        return `Re: Invoice ${invoiceLabel}`;
    }

    return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

// Deterministic, non-AI-generated content for the "Request Proof" action
// (see services/server/paymentProofRequestService.ts). Kept separate from
// lib/gmail/send.ts (the generic outbound primitive, reusable for
// Reminders) and from the API route, so a future Reminders workflow can
// share the sender/threading infrastructure while supplying its own
// composer instead of this one.
//
// Deliberately does not claim the payment was received, rejected, or that
// the customer is mistaken — only that it hasn't been matched YET.
export function composeProofRequestEmail(
    input: ProofRequestEmailInput
): ComposedEmail {
    const subject = toReplySubject(input.originalSubject, input.invoiceLabel);

    const body = `Hi ${input.customerName},

Thanks for the update.

You mentioned that the payment for Invoice ${input.invoiceLabel} has been made, but we haven't been able to match the payment in our records yet.

Could you please share the payment reference / UTR / transaction confirmation so we can locate and reconcile the payment?

Once we receive the details, we'll verify the payment against our records.

Thank you.`;

    return { subject, body };
}
