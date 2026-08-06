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

export async function getOutstandingAmount(): Promise<number> {
    const { data, error } = await supabase
        .from("invoices")
        .select("balance_due")
        .in("status", [
            "pending",
            "partial",
            "overdue",
        ]);

    if (error) {
        throw error;
    }

    return data.reduce(
        (sum, invoice) =>
            sum + Number(invoice.balance_due),
        0
    );
}

export async function getOverdueInvoiceCount(): Promise<number> {
    const { count, error } = await supabase
        .from("invoices")
        .select("*", {
            head: true,
            count: "exact",
        })
        .eq("status", "overdue");

    if (error) {
        throw error;
    }

    return count ?? 0;
}

export async function getInvoicesNeedingReview(): Promise<number> {
    const { count, error } = await supabase
        .from("invoices")
        .select("*", {
            head: true,
            count: "exact",
        })
        .eq(
            "invoice_confidence_level",
            "low"
        );

    if (error) {
        throw error;
    }

    return count ?? 0;
}

import { toLocalDateString } from "@/lib/date";

export async function getOutstandingLastMonth(): Promise<number> {
    const today = new Date();

    const lastMonthStart = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
    );

    const lastMonthSameDay = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        today.getDate()
    );

    const { data, error } = await supabase
        .from("invoices")
        .select("balance_due")
        .gte(
            "invoice_date",
            toLocalDateString(lastMonthStart)
        )
        .lte(
            "invoice_date",
            toLocalDateString(lastMonthSameDay)
        )
        .gt("balance_due", 0);

    if (error) throw error;

    return data.reduce(
        (sum, invoice) =>
            sum + Number(invoice.balance_due),
        0
    );
}

export async function getOverdueInvoiceCountLastMonth(): Promise<number> {
    const today = new Date();

    const lastMonthStart = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
    );

    const lastMonthSameDay = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        today.getDate()
    );

    const { count, error } = await supabase
        .from("invoices")
        .select("*", {
            count: "exact",
            head: true,
        })
        .eq("status", "overdue")
        .gte(
            "invoice_date",
            toLocalDateString(lastMonthStart)
        )
        .lte(
            "invoice_date",
            toLocalDateString(lastMonthSameDay)
        );

    if (error) throw error;

    return count ?? 0;
}