export const ActivityTypes = {
    INVOICE_CREATED: "invoice_created",
    INVOICE_VALIDATED: "invoice_validated",
    INVOICE_UPLOADED: "invoice_uploaded",
    INVOICE_CONFIDENCE_CALCULATED: "invoice_confidence_calculated",

    CUSTOMER_CREATED: "customer_created",
    CUSTOMER_MATCHED: "customer_matched",

    REMINDER_SCHEDULED: "reminder_scheduled",
    REMINDER_SENT: "reminder_sent",

    PAYMENT_RECORDED: "payment_recorded",

    INVOICE_PAID: "invoice_paid",
    INVOICE_PARTIALLY_PAID: "invoice_partially_paid",
    INVOICE_OVERDUE: "invoice_overdue",
    CUSTOMER_INSIGHTS_UPDATED: "customer_insights_updated",

} as const;

export type ActivityType =
    (typeof ActivityTypes)[keyof typeof ActivityTypes];