import { findCustomerByEmail } from "@/services/server/customerService";
import { findExistingInvoice } from "@/services/invoiceService";
import {
    extractPaymentDetails,
    PaymentExtractionResult,
} from "@/services/server/paymentExtractionService";
import { Invoice } from "@/app/types/invoice";
import { PaymentMethodType } from "@/lib/paymentMethods";

const MIN_CONFIDENCE = 0.9;

export interface PaymentEmailMatchInput {
    subject: string | null;
    textBody: string | null;
    fromEmail: string;
    receivedAt: string;
}

export type PaymentEmailMatchStatus = "ready" | "needs_review";

export type PaymentEmailNeedsReviewReason =
    | "customer_not_found"
    | "payment_facts_incomplete"
    | "low_extraction_confidence"
    | "invoice_not_found"
    | "currency_mismatch"
    | "invalid_amount"
    | "overpayment";

export interface PaymentEmailReadyResult {
    status: "ready";
    customerId: string;
    invoiceId: string;
    amount: number;
    currency: string;
    paymentDate: Date;
    paymentMethod: PaymentMethodType;
    paymentReference: string | null;
    invoiceNumber: string;
    confidence: number;
}

export interface PaymentEmailNeedsReviewResult {
    status: "needs_review";
    reason: PaymentEmailNeedsReviewReason;
    normalizedFromEmail: string;
    customerId: string | null;
    invoiceId: string | null;
    extracted: PaymentExtractionResult | null;
}

export type PaymentEmailMatchResult =
    | PaymentEmailReadyResult
    | PaymentEmailNeedsReviewResult;

// If the header includes a display name ("Name <addr>"), extract the
// bare address inside the angle brackets; otherwise treat the whole
// value as the address. Lowercased for an exact, case-insensitive-safe
// comparison against customers.email.
export function normalizeFromEmail(fromEmail: string): string {
    const angleMatch = fromEmail.match(/<([^>]+)>/);
    const rawAddress = angleMatch ? angleMatch[1] : fromEmail;

    return rawAddress.trim().toLowerCase();
}

function needsReview(
    reason: PaymentEmailNeedsReviewReason,
    normalizedFromEmail: string,
    customerId: string | null,
    invoiceId: string | null,
    extracted: PaymentExtractionResult | null
): PaymentEmailNeedsReviewResult {
    return {
        status: "needs_review",
        reason,
        normalizedFromEmail,
        customerId,
        invoiceId,
        extracted,
    };
}

// Deterministic-only matcher: no AI judgment is used to decide whether
// a match is valid. extractPaymentDetails() supplies facts; every
// acceptance/rejection decision below is a plain rule. Never writes to
// the database — callers decide whether/when to act on a "ready"
// result via the existing recordPayment().
export async function matchPaymentEmail(
    input: PaymentEmailMatchInput
): Promise<PaymentEmailMatchResult> {
    const normalizedFromEmail = normalizeFromEmail(input.fromEmail);

    const customer = await findCustomerByEmail(normalizedFromEmail);

    if (!customer) {
        return needsReview(
            "customer_not_found",
            normalizedFromEmail,
            null,
            null,
            null
        );
    }

    const extracted = await extractPaymentDetails({
        subject: input.subject,
        textBody: input.textBody,
    });

    // paymentDate is deliberately NOT part of this gate: it plays no
    // role in identifying or validating the invoice (findExistingInvoice
    // matches on customer_id + invoice_number only), so a missing
    // paymentDate must never block invoice resolution. It is checked
    // separately below, after the invoice has been resolved and
    // validated, so a "ready" result always has a real paymentDate
    // while a "needs_review" result for a missing date still carries
    // the correctly resolved invoiceId.
    if (
        extracted.amount == null ||
        extracted.currency == null ||
        extracted.invoiceNumber == null
    ) {
        return needsReview(
            "payment_facts_incomplete",
            normalizedFromEmail,
            customer.id,
            null,
            extracted
        );
    }

    if (extracted.confidence < MIN_CONFIDENCE) {
        return needsReview(
            "low_extraction_confidence",
            normalizedFromEmail,
            customer.id,
            null,
            extracted
        );
    }

    const normalizedInvoiceNumber = extracted.invoiceNumber.trim();

    const invoice: Invoice | null = await findExistingInvoice(
        customer.id,
        normalizedInvoiceNumber
    );

    if (!invoice) {
        return needsReview(
            "invoice_not_found",
            normalizedFromEmail,
            customer.id,
            null,
            extracted
        );
    }

    const normalizedExtractedCurrency = extracted.currency
        .trim()
        .toUpperCase();

    const normalizedInvoiceCurrency = invoice.currency
        .trim()
        .toUpperCase();

    if (normalizedExtractedCurrency !== normalizedInvoiceCurrency) {
        return needsReview(
            "currency_mismatch",
            normalizedFromEmail,
            customer.id,
            invoice.id,
            extracted
        );
    }

    if (extracted.amount <= 0) {
        return needsReview(
            "invalid_amount",
            normalizedFromEmail,
            customer.id,
            invoice.id,
            extracted
        );
    }

    if (extracted.amount > Number(invoice.balance_due)) {
        return needsReview(
            "overpayment",
            normalizedFromEmail,
            customer.id,
            invoice.id,
            extracted
        );
    }

    // Checked here, not in the upfront gate: the invoice is already
    // resolved and validated at this point, so a missing paymentDate
    // still reports back the correct invoiceId/amount/currency for
    // review instead of an unlinked proposal.
    if (extracted.paymentDate == null) {
        return needsReview(
            "payment_facts_incomplete",
            normalizedFromEmail,
            customer.id,
            invoice.id,
            extracted
        );
    }

    // Explicit extracted date only — never receivedAt.
    const paymentDate = new Date(extracted.paymentDate);

    return {
        status: "ready",
        customerId: customer.id,
        invoiceId: invoice.id,
        amount: extracted.amount,
        currency: normalizedExtractedCurrency,
        paymentDate,
        // paymentExtractionService does not extract a payment method —
        // this is a placeholder, not an inferred value.
        paymentMethod: "other",
        paymentReference: extracted.paymentReference,
        invoiceNumber: normalizedInvoiceNumber,
        confidence: extracted.confidence,
    };
}
