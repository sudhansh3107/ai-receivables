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

// Reconciliation between an actual payment and the "human attention"
// payment_decisions queue — see services/server/paymentService.ts::
// recordPayment(), the ONLY caller. Resolution is deliberately
// INVOICE-level, not payment-level: the schema cannot safely attribute
// one specific payment to one specific customer claim (multiple
// payment_decisions may legitimately exist for the same invoice — see
// the audit this implements), but once an invoice reaches
// balance_due=0 there is, by definition, no remaining receivable for
// ANY pending decision against it to be about. Resolves EVERY pending
// decision for the given invoice, never just the oldest/one with the
// closest matching amount.
//
// Reuses the exact existing vocabulary paymentDecisionExecutionService.ts
// ::resolveDecisionAsAlreadySettled() already established for a pending
// decision whose invoice turns out to already be settled: status
// moves to 'rejected' (not a human rejection — see that function's own
// docs) with resolution_reason='invoice_already_settled'. execution_status
// is left untouched (still 'not_executed', which
// payment_decisions_execution_requires_approval_check already permits
// regardless of status), and deferred_at is deliberately left untouched
// too — WAIT's lifecycle is out of scope for this change.
//
// Conditional UPDATE (WHERE status='pending'), not read-then-write: safe
// to call from multiple concurrent recordPayment() invocations, or twice
// for the same invoice (e.g. two payments that both happen to fully
// settle it, or a retry) — only rows still 'pending' at the moment this
// specific UPDATE executes are affected, so a decision already resolved
// by an earlier call (or already approved/executed) is never touched or
// double-reported. Returns exactly the rows this call transitioned, for
// the caller to log one Activity Feed entry per decision.
export interface SettledInvoicePaymentDecision {
    id: string;
    customerId: string | null;
    invoiceId: string;
}

export async function resolvePaymentDecisionsForSettledInvoice(
    invoiceId: string
): Promise<SettledInvoicePaymentDecision[]> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            status: "rejected",
            rejected_at: new Date().toISOString(),
            resolution_reason: "invoice_already_settled",
            updated_at: new Date().toISOString(),
        })
        .eq("invoice_id", invoiceId)
        .eq("status", "pending")
        .select("id, customer_id, invoice_id");

    if (error) throw error;

    return (data ?? []).map((row) => ({
        id: row.id as string,
        customerId: row.customer_id as string | null,
        invoiceId: row.invoice_id as string,
    }));
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

    // Query-time visibility backstop — defense-in-depth only.
    // resolvePaymentDecisionsForSettledInvoice() above is the
    // authoritative state mutation; this catches anything it missed
    // (a decision whose invoice was already fully paid before this
    // feature existed, or any gap between a payment write and its
    // reconciliation step) without mutating anything here.
    //
    // A single embedded-resource query (e.g. filtering on a joined
    // `invoices.balance_due`) is NOT usable for this: PostgREST only
    // applies a filter to an embedded resource by turning the embed
    // into an inner join, which would silently drop every decision
    // with invoice_id IS NULL entirely (e.g. needs_review_reason=
    // 'invoice_not_found') instead of correctly keeping them visible.
    // So this batch-fetches invoice balances separately and filters in
    // JS — the same established pattern decisionService.ts::
    // getRiskRankByCustomer() already uses for an analogous batch
    // lookup, not a new mechanism.
    const invoiceIds = Array.from(
        new Set(
            rows
                .map((row) => row.invoice_id)
                .filter((id): id is string => id !== null)
        )
    );

    let settledInvoiceIds = new Set<string>();

    if (invoiceIds.length > 0) {
        const { data: invoiceRows, error: invoiceError } = await supabase
            .from("invoices")
            .select("id, balance_due")
            .in("id", invoiceIds);

        if (invoiceError) throw invoiceError;

        settledInvoiceIds = new Set(
            (invoiceRows ?? [])
                .filter((invoice) => Number(invoice.balance_due) <= 0)
                .map((invoice) => invoice.id as string)
        );
    }

    const visibleRows = rows.filter(
        (row) =>
            row.invoice_id === null ||
            !settledInvoiceIds.has(row.invoice_id)
    );

    return visibleRows.map((row) => ({
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
