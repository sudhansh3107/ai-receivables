import { ExtractedInvoice } from "./invoiceExtractionService";

export function validateInvoice(invoice: ExtractedInvoice) {

    if (!invoice.invoiceNumber?.trim()) {
        throw new Error("Invoice number is missing.");
    }

    if (!invoice.companyName?.trim()) {
        throw new Error("Company name is missing.");
    }

    if (invoice.invoiceAmount <= 0) {
        throw new Error("Invoice amount must be greater than zero.");
    }

    if (!invoice.currency?.trim()) {
        throw new Error("Currency is missing.");
    }

    if (!invoice.invoiceDate) {
        throw new Error("Invoice date is missing.");
    }

    if (!invoice.dueDate) {
        throw new Error("Due date is missing.");
    }

    return true;
}