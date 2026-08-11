import { supabase } from "@/lib/supabase";
import { PaymentEmailMatchResult } from "@/services/server/paymentEmailMatchingService";

export interface PendingPaymentDecision {
    id: string;
    emailId: string;

    customerId: string | null;
    customerName: string | null;

    invoiceId: string | null;
    invoiceNumber: string | null;

    status: string;
    executionStatus: string;
    needsReviewReason: string | null;

    proposedAmount: number | null;
    proposedCurrency: string | null;
    proposedPaymentDate: string | null;
    proposedPaymentReference: string | null;
    extractionConfidence: number | null;

    matchEvidence: unknown;
    executionError: string | null;

    createdAt: string;
}

interface PendingPaymentDecisionRow {
    id: string;
    email_id: string;
    customer_id: string | null;
    invoice_id: string | null;
    status: string;
    execution_status: string;
    needs_review_reason: string | null;
    proposed_amount: number | null;
    proposed_currency: string | null;
    proposed_payment_date: string | null;
    proposed_invoice_number: string | null;
    proposed_payment_reference: string | null;
    extraction_confidence: number | null;
    match_evidence: unknown;
    execution_error: string | null;
    created_at: string;
    customers: { company_name: string } | null;
    invoices: { invoice_number: string } | null;
}

function toDateOnlyString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function buildProposedFacts(matchResult: PaymentEmailMatchResult) {
    if (matchResult.status === "ready") {
        return {
            customer_id: matchResult.customerId,
            invoice_id: matchResult.invoiceId,
            proposed_amount: matchResult.amount,
            proposed_currency: matchResult.currency,
            proposed_payment_date: toDateOnlyString(
                matchResult.paymentDate
            ),
            proposed_invoice_number: matchResult.invoiceNumber,
            proposed_payment_reference: matchResult.paymentReference,
            extraction_confidence: matchResult.confidence,
            needs_review_reason: null,
        };
    }

    return {
        customer_id: matchResult.customerId,
        invoice_id: matchResult.invoiceId,
        proposed_amount: matchResult.extracted?.amount ?? null,
        proposed_currency: matchResult.extracted?.currency ?? null,
        proposed_payment_date:
            matchResult.extracted?.paymentDate ?? null,
        proposed_invoice_number:
            matchResult.extracted?.invoiceNumber ?? null,
        proposed_payment_reference:
            matchResult.extracted?.paymentReference ?? null,
        extraction_confidence:
            matchResult.extracted?.confidence ?? null,
        needs_review_reason: matchResult.reason,
    };
}

// Lifecycle-safe: this function only ever creates a fresh proposal or
// refreshes an UNTOUCHED one. It never approves, executes, or touches
// payments/invoices/customers/emails, and it never overwrites a
// decision that has progressed beyond "pending/not_executed" — the
// authoritative human/system lifecycle state always wins over a
// reprocessed email.
export async function persistPaymentDecision(
    emailId: string,
    matchResult: PaymentEmailMatchResult
) {
    const { data: existing, error: selectError } = await supabase
        .from("payment_decisions")
        .select("*")
        .eq("email_id", emailId)
        .maybeSingle();

    if (selectError) throw selectError;

    const proposedFacts = buildProposedFacts(matchResult);

    // CASE 1 — no existing row: create a fresh, untouched proposal.
    if (!existing) {
        const { data, error } = await supabase
            .from("payment_decisions")
            .insert({
                email_id: emailId,

                ...proposedFacts,

                // Structured, complete snapshot of what the matcher
                // returned, for a future review UI. Typed columns
                // above are populated independently — this is not
                // the only place the queryable facts live.
                match_evidence: matchResult,

                status: "pending",
                execution_status: "not_executed",
                payment_id: null,
                approved_at: null,
                rejected_at: null,
                executed_at: null,
                execution_error: null,
            })
            .select()
            .single();

        if (error) throw error;

        return data;
    }

    // CASE 3 — the decision has progressed beyond an untouched
    // proposal (approved, rejected, executing, executed, or
    // execution_failed). The authoritative lifecycle state wins:
    // return it exactly as-is, no write at all.
    const isUntouchedProposal =
        existing.status === "pending" &&
        existing.execution_status === "not_executed";

    if (!isUntouchedProposal) {
        return existing;
    }

    // CASE 2 — still an untouched proposal: safe to refresh the
    // proposed facts/evidence with the latest matchResult, while
    // explicitly re-affirming (not just relying on "unchanged") that
    // it stays pending/not_executed with no lifecycle progression.
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            ...proposedFacts,

            match_evidence: matchResult,

            status: "pending",
            execution_status: "not_executed",
            payment_id: null,
            approved_at: null,
            rejected_at: null,
            executed_at: null,
            execution_error: null,

            updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

    if (error) throw error;

    return data;
}

// Read-only display source for the payment-decision review UI (the
// "future review UI" match_evidence above was captured for). Scoped
// to status='pending' only — approved/rejected/executed decisions are
// a separate, not-yet-built concern. Newest first, with the
// customer/invoice context a review UI needs; every proposed_* column,
// needs_review_reason, and match_evidence are preserved verbatim
// (never re-derived) so the UI reflects exactly what the matcher
// decided. Never approves, executes, or writes anything.
export async function getPendingPaymentDecisions(): Promise<
    PendingPaymentDecision[]
> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .select(
            `
            id,
            email_id,
            customer_id,
            invoice_id,
            status,
            execution_status,
            needs_review_reason,
            proposed_amount,
            proposed_currency,
            proposed_payment_date,
            proposed_invoice_number,
            proposed_payment_reference,
            extraction_confidence,
            match_evidence,
            execution_error,
            created_at,
            customers ( company_name ),
            invoices ( invoice_number )
        `
        )
        .eq("status", "pending")
        .order("created_at", { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as unknown as PendingPaymentDecisionRow[];

    return rows.map((row) => ({
        id: row.id,
        emailId: row.email_id,

        customerId: row.customer_id,
        customerName: row.customers?.company_name ?? null,

        invoiceId: row.invoice_id,
        invoiceNumber:
            row.invoices?.invoice_number ??
            row.proposed_invoice_number ??
            null,

        status: row.status,
        executionStatus: row.execution_status,
        needsReviewReason: row.needs_review_reason,

        proposedAmount:
            row.proposed_amount === null
                ? null
                : Number(row.proposed_amount),
        proposedCurrency: row.proposed_currency,
        proposedPaymentDate: row.proposed_payment_date,
        proposedPaymentReference: row.proposed_payment_reference,
        extractionConfidence:
            row.extraction_confidence === null
                ? null
                : Number(row.extraction_confidence),

        matchEvidence: row.match_evidence,
        executionError: row.execution_error,

        createdAt: row.created_at,
    }));
}
