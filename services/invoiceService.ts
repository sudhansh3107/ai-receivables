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

export interface InvoiceNeedingReview {
    id: string;
    invoiceNumber: string;
    customerName: string;
    amount: number;
    currency: string;
}

interface InvoiceNeedingReviewRow {
    id: string;
    invoice_number: string;
    invoice_amount: number;
    currency: string;
    customers: { company_name: string } | null;
}

export async function getInvoicesNeedingReviewDetails(
    limit = 5
): Promise<InvoiceNeedingReview[]> {
    const { data, error } = await supabase
        .from("invoices")
        .select(
            `
            id,
            invoice_number,
            invoice_amount,
            currency,
            customers (
                company_name
            )
        `
        )
        .eq("invoice_confidence_level", "low")
        .order("created_at", { ascending: false })
        .limit(limit);

    if (error) {
        throw error;
    }

    const rows = (data ?? []) as unknown as InvoiceNeedingReviewRow[];

    return rows.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerName:
            invoice.customers?.company_name ?? "Unknown customer",
        amount: Number(invoice.invoice_amount),
        currency: invoice.currency,
    }));
}

import { toLocalDateString } from "@/lib/date";

export interface UploadSessionConfidenceBreakdown {
    needsReview: number;
    reviewRecommended: number;
    highConfidence: number;
}

export async function getUploadSessionConfidenceBreakdown(
    uploadSessionId: string
): Promise<UploadSessionConfidenceBreakdown> {
    const { data, error } = await supabase
        .from("invoices")
        .select("invoice_confidence_level")
        .eq("upload_session_id", uploadSessionId);

    if (error) {
        throw error;
    }

    return data.reduce(
        (breakdown, invoice) => {
            if (invoice.invoice_confidence_level === "low") {
                breakdown.needsReview += 1;
            } else if (invoice.invoice_confidence_level === "medium") {
                breakdown.reviewRecommended += 1;
            } else if (invoice.invoice_confidence_level === "high") {
                breakdown.highConfidence += 1;
            }

            return breakdown;
        },
        {
            needsReview: 0,
            reviewRecommended: 0,
            highConfidence: 0,
        }
    );
}

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