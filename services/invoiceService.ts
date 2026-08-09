import { supabase } from "@/lib/supabase";
import { ExtractedInvoice } from "./server/invoiceExtractionService";
import { InvoiceConfidenceResult } from "./server/invoiceConfidenceService";
import { toLocalDateString } from "@/lib/date";
import { OVERDUE_INVOICE_STATUSES } from "@/lib/invoiceOverdue";

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

export interface OverdueInvoicesSummary {
    count: number;
    amount: number;
}

// Authoritative overdue calculation, reused by the dashboard metric,
// Mission, and Decision Activity. See lib/invoiceOverdue.ts for why
// this is derived from due_date rather than the (never-written)
// "overdue" status value.
export async function getOverdueInvoicesSummary(): Promise<OverdueInvoicesSummary> {
    const today = toLocalDateString(new Date());

    const { data, error } = await supabase
        .from("invoices")
        .select("balance_due")
        .in("status", OVERDUE_INVOICE_STATUSES)
        .lt("due_date", today);

    if (error) {
        throw error;
    }

    return {
        count: data.length,
        amount: data.reduce(
            (sum, invoice) =>
                sum + Number(invoice.balance_due),
            0
        ),
    };
}

export async function getOverdueInvoiceCount(): Promise<number> {
    const summary = await getOverdueInvoicesSummary();
    return summary.count;
}

export interface InvoiceNeedingReview {
    id: string;
    invoiceNumber: string;
    customerId: string;
    customerName: string;
    amount: number;
    currency: string;
    confidenceReasons: string[] | null;
    createdAt: string;
}

interface InvoiceNeedingReviewRow {
    id: string;
    invoice_number: string;
    customer_id: string;
    invoice_amount: number;
    currency: string;
    invoice_confidence_reasons: string[] | null;
    created_at: string;
    customers: { company_name: string } | null;
}

// The single source of unreviewed low-confidence invoices, used both
// by the Metrics "Needs Review" count (via
// getUnreviewedLowConfidenceInvoiceCount below) and by the Decision
// queue's ranking input. Excludes invoices a human has already
// reviewed — invoice_confidence_score/level/reasons are untouched;
// only confidence_reviewed_at (a separate, human-only field) drives
// this filter. Pass no `limit` to fetch the full candidate set (the
// Decision queue must rank against everything, not a pre-truncated
// slice).
export async function getInvoicesNeedingReviewDetails(
    limit?: number
): Promise<InvoiceNeedingReview[]> {
    let query = supabase
        .from("invoices")
        .select(
            `
            id,
            invoice_number,
            customer_id,
            invoice_amount,
            currency,
            invoice_confidence_reasons,
            created_at,
            customers (
                company_name
            )
        `
        )
        .eq("invoice_confidence_level", "low")
        .is("confidence_reviewed_at", null)
        .order("created_at", { ascending: false });

    if (limit !== undefined) {
        query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
        throw error;
    }

    const rows = (data ?? []) as unknown as InvoiceNeedingReviewRow[];

    return rows.map((invoice) => ({
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerId: invoice.customer_id,
        customerName:
            invoice.customers?.company_name ?? "Unknown customer",
        amount: Number(invoice.invoice_amount),
        currency: invoice.currency,
        confidenceReasons: invoice.invoice_confidence_reasons,
        createdAt: invoice.created_at,
    }));
}

export async function getUnreviewedLowConfidenceInvoiceCount(): Promise<number> {
    const { count, error } = await supabase
        .from("invoices")
        .select("*", {
            head: true,
            count: "exact",
        })
        .eq("invoice_confidence_level", "low")
        .is("confidence_reviewed_at", null);

    if (error) {
        throw error;
    }

    return count ?? 0;
}

// Explicit human action evidence. Deliberately does not read or
// write invoice_confidence_score/level/reasons — those remain
// AI-only extraction signals.
export async function markInvoiceReviewed(
    invoiceId: string
): Promise<void> {
    const { error } = await supabase
        .from("invoices")
        .update({
            confidence_reviewed_at: new Date().toISOString(),
        })
        .eq("id", invoiceId);

    if (error) {
        throw error;
    }
}

export async function getInvoiceReviewsCompletedTodayCount(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { count, error } = await supabase
        .from("invoices")
        .select("*", {
            head: true,
            count: "exact",
        })
        .gte("confidence_reviewed_at", start.toISOString())
        .lte("confidence_reviewed_at", end.toISOString());

    if (error) {
        throw error;
    }

    return count ?? 0;
}

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