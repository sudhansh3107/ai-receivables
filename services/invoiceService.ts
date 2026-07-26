import { supabase } from "@/lib/supabase";
import { ExtractedInvoice } from "./server/invoiceExtractionService";
import { InvoiceConfidenceResult } from "./server/invoiceConfidenceService";

export async function findExistingInvoice(
    customerId: string,
    invoiceNumber: string
) {
    const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("customer_id", customerId)
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();

    if (error) throw error;

    return data;
}

export async function createInvoice(
    customerId: string,
    uploadSessionId: string | null,
    invoice: ExtractedInvoice,
    confidence: InvoiceConfidenceResult
) {

    

    const { data, error } = await supabase
        .from("invoices")
        .insert({
            customer_id: customerId,
            upload_session_id: uploadSessionId,

            invoice_number: invoice.invoiceNumber,
            invoice_date: invoice.invoiceDate,
            due_date: invoice.dueDate,

            currency: invoice.currency,

            invoice_amount: invoice.invoiceAmount,
            balance_due: invoice.invoiceAmount,

            status: "pending",
            source_type: "upload",

            invoice_confidence_score: confidence.score,
            invoice_confidence_level: confidence.level,
            invoice_confidence_reasons: confidence.reasons,
        })
        .select()
        .single();

    if (error) throw error;

    return data;
}