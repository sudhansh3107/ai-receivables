// Human-readable labels for payment_decisions.needs_review_reason —
// mirrors PaymentEmailNeedsReviewReason in
// services/server/paymentEmailMatchingService.ts verbatim. Single
// source shared by every surface that displays a payment decision's
// review reason (Mission Control's DecisionFeed, /decisions'
// PaymentDecisionFeed) so the wording never drifts between them.
export const PAYMENT_DECISION_REVIEW_REASON_LABELS: Record<
    string,
    string
> = {
    customer_not_found: "Customer not found",
    payment_facts_incomplete: "Missing payment details",
    low_extraction_confidence: "Low extraction confidence",
    invoice_not_found: "Invoice not found",
    currency_mismatch: "Currency mismatch",
    invalid_amount: "Invalid amount",
    overpayment: "Overpayment",
};
