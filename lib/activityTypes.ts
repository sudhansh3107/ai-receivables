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

    PAYMENT_RECORDED: "payment_recorded",

    INVOICE_PAID: "invoice_paid",
    INVOICE_PARTIALLY_PAID: "invoice_partially_paid",
    INVOICE_OVERDUE: "invoice_overdue",
    CUSTOMER_INSIGHTS_UPDATED: "customer_insights_updated",

    PAYMENT_DECISION_APPROVED: "payment_decision_approved",
    PAYMENT_DECISION_EXECUTED: "payment_decision_executed",
    PAYMENT_DECISION_EXECUTION_FAILED: "payment_decision_execution_failed",

} as const;

export type ActivityType =
    (typeof ActivityTypes)[keyof typeof ActivityTypes];