export const InvoiceStatus = {
    PENDING: "pending",
    PARTIAL: "partial",
    PAID: "paid",
    OVERDUE: "overdue",
} as const;

export type InvoiceStatusType =
    (typeof InvoiceStatus)[keyof typeof InvoiceStatus];