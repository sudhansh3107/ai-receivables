export const ActivityTypes = {
    INVOICE_CREATED: "invoice_created",
    INVOICE_VALIDATED: "invoice_validated",
    INVOICE_UPLOADED: "invoice_uploaded",
    INVOICE_CONFIDENCE_CALCULATED: "invoice_confidence_calculated",

    CUSTOMER_CREATED: "customer_created",
    CUSTOMER_MATCHED: "customer_matched",

    REMINDER_SCHEDULED: "reminder_scheduled",
    REMINDER_SENT: "reminder_sent",

    // Discovery/work events, not financial outcomes — a customer
    // EMAIL CLAIMING a payment is not proof cash was received, and a
    // structurally-matched claim is not a confirmed payment. Never
    // include these in a "completed outcome" count (that remains
    // PAYMENT_RECORDED / INVOICE_PAID only).
    PAYMENT_CLAIM_RECEIVED: "payment_claim_received",
    PAYMENT_CLAIM_MATCHED: "payment_claim_matched",

    // A human explicitly chose "Request Proof" on an unresolved payment
    // claim (see services/server/paymentProofRequestService.ts) — a
    // deterministic reply was sent asking the customer for evidence. The
    // underlying payment_decision remains unresolved; this is a discovery/
    // work event, not a financial outcome.
    PAYMENT_PROOF_REQUESTED: "payment_proof_requested",

    PAYMENT_RECORDED: "payment_recorded",

    INVOICE_PAID: "invoice_paid",
    INVOICE_PARTIALLY_PAID: "invoice_partially_paid",
    INVOICE_OVERDUE: "invoice_overdue",
    CUSTOMER_INSIGHTS_UPDATED: "customer_insights_updated",

    PAYMENT_DECISION_APPROVED: "payment_decision_approved",
    PAYMENT_DECISION_EXECUTED: "payment_decision_executed",
    PAYMENT_DECISION_EXECUTION_FAILED: "payment_decision_execution_failed",

    // A human explicitly chose "Wait" on a pending payment_decision —
    // NOT an approval. See services/server/paymentDecisionExecutionService.ts::
    // deferPaymentDecision(). Sends no email, creates no payment; only
    // hides the decision from the queue for 24 hours via deferred_at.
    PAYMENT_DECISION_DEFERRED: "payment_decision_deferred",

    // The SYSTEM resurfacing a deferred decision after its 24-hour wait
    // elapsed with no proof received — distinct from
    // PAYMENT_DECISION_DEFERRED (the human's WAIT click that started the
    // clock). See services/server/paymentDecisionService.ts::
    // getPendingPaymentDecisions() / logWaitCompletedForResurfacedDecisions().
    // Logged at most once per WAIT cycle (keyed by decisionId + the
    // deferred_at value that started that cycle); a new WAIT click resets
    // deferred_at and makes the next expiry eligible for another event.
    PAYMENT_DECISION_WAIT_COMPLETED: "payment_decision_wait_completed",

    // A pending payment_decision was automatically resolved because its
    // invoice reached balance_due=0 through an actual payment — see
    // services/server/paymentDecisionService.ts::
    // resolvePaymentDecisionsForSettledInvoice(), called from
    // paymentService.ts::recordPayment(). Distinct from PAYMENT_RECORDED/
    // INVOICE_PAID (the financial event itself, always logged
    // unconditionally by recordPayment()) — this is the separate fact
    // that a specific human-attention item no longer needs attention
    // because of that event. Never fabricates a payment_id-to-decision
    // relationship; resolution is invoice-level, not payment-level.
    PAYMENT_DECISION_RESOLVED: "payment_decision_resolved",

} as const;

export type ActivityType =
    (typeof ActivityTypes)[keyof typeof ActivityTypes];