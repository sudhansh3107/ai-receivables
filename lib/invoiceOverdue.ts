/**
 * Single authoritative definition of "overdue" for an invoice.
 *
 * An invoice is overdue when it still owes money (status is
 * "pending" or "partial" — "paid" and "cancelled" are excluded)
 * and its due date has passed. `invoices.status` is never
 * transitioned to the literal "overdue" value by any write path,
 * so overdue must always be derived from due_date, not read from
 * status.
 */

export const OVERDUE_INVOICE_STATUSES = [
    "pending",
    "partial",
] as const;

export function isInvoiceOverdue(
    invoice: {
        status: string;
        due_date: string;
    },
    todayDateString: string
): boolean {
    return (
        (OVERDUE_INVOICE_STATUSES as readonly string[]).includes(
            invoice.status
        ) && invoice.due_date < todayDateString
    );
}
