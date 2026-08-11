import { supabase } from "@/lib/supabase";
import { PaymentEmailMatchResult } from "@/services/server/paymentEmailMatchingService";
import { logActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";

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

    // Non-null means this decision was previously deferred via WAIT and
    // has now resurfaced (getPendingPaymentDecisions only ever returns a
    // deferred row once its 24-hour window has elapsed — see that
    // function's own docs), so the UI can show "payment still
    // unconfirmed" context. Null means never deferred, or the queue's
    // ordinary "no wait has happened" case.
    deferredAt: string | null;

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
    deferred_at: string | null;
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

// One Activity Feed entry per WAIT cycle for a decision that resurfaces
// with no confirmation — see getPendingPaymentDecisions() below, the
// only caller. A "cycle" is identified by the (decisionId, deferred_at)
// pair: deferred_at only ever changes when a human clicks WAIT again
// (see paymentDecisionExecutionService.ts::deferPaymentDecision()), so
// re-checking against the CURRENT deferred_at value on every call is
// what makes this idempotent across repeated dashboard refreshes for
// the same cycle, while still allowing exactly one new event the next
// time the decision is deferred and resurfaces again. Reuses the
// existing Activity Feed as the record of "already logged" rather than
// adding a new column — there is no cron/poller driving this; it is
// detected at read time, the only time resurfacing is observable.
//
// Best-effort: a failure here must never break the read it's attached
// to (unlike an explicit user-initiated action such as WAIT/Approve,
// this is a passive side effect of loading the queue), so errors are
// logged and swallowed rather than thrown.
async function logWaitCompletedForResurfacedDecisions(
    resurfacedRows: PendingPaymentDecisionRow[]
): Promise<void> {
    for (const row of resurfacedRows) {
        try {
            const { data: existing, error: existingError } = await supabase
                .from("activity_log")
                .select("id")
                .eq(
                    "activity_type",
                    ActivityTypes.PAYMENT_DECISION_WAIT_COMPLETED
                )
                .eq("metadata->>decisionId", row.id)
                .eq("metadata->>deferredAt", row.deferred_at as string)
                .limit(1)
                .maybeSingle();

            if (existingError) throw existingError;

            if (existing) continue;

            await logActivity({
                invoiceId: row.invoice_id,
                customerId: row.customer_id ?? undefined,
                activityType: ActivityTypes.PAYMENT_DECISION_WAIT_COMPLETED,
                description:
                    "24-hour wait completed — no payment proof received.",
                metadata: {
                    decisionId: row.id,
                    deferredAt: row.deferred_at,
                },
            });
        } catch (err) {
            console.error(
                `Failed to log payment_decision_wait_completed for decision ${row.id}:`,
                err
            );
        }
    }
}

// Read-only display source for the payment-decision review UI (the
// "future review UI" match_evidence above was captured for). Scoped
// to status='pending' only — approved/rejected/executed decisions are
// a separate, not-yet-built concern. Newest first, with the
// customer/invoice context a review UI needs; every proposed_* column,
// needs_review_reason, and match_evidence are preserved verbatim
// (never re-derived) so the UI reflects exactly what the matcher
// decided. Never approves, executes, rejects, or otherwise mutates a
// payment_decision — the one exception is the best-effort Activity
// Feed entry logged via logWaitCompletedForResurfacedDecisions() above
// when a deferred decision resurfaces, which is idempotent and does
// not touch payment_decisions itself.
//
// needs_review_reason='customer_not_found' rows are excluded below:
// matchPaymentEmail() (paymentEmailMatchingService.ts) returns that
// reason with customerId/invoiceId both null and never even attempts
// extraction, so every proposed_* column on the resulting row is also
// null. There is no sender to reply to, so Request Proof always
// rejects with missing_customer_email for these
// (paymentProofRequestService.ts), and nothing ever resolves them
// (resolvePaymentDecisionsForSettledInvoice() matches on invoice_id,
// which is null here) — they are not actionable, only noise that
// previously rendered as "Unknown customer / Invoice unknown / Unknown
// amount". The underlying row is left completely untouched (still
// status='pending' in the database); this only removes it from this
// display query. This is the single source both Mission Control's
// DecisionFeed (via decisionService.ts::getDecisionQueue()) and
// /decisions' PaymentDecisionFeed read from, so excluding it here
// removes these cards from both surfaces (and from the Mission Card's
// "Decisions" count, which reuses the same totalCount) at once.
export async function getPendingPaymentDecisions(): Promise<
    PendingPaymentDecision[]
> {
    // Wait's ONLY resurfacing mechanism (no cron/poller/scheduler — see
    // services/server/paymentDecisionExecutionService.ts::
    // deferPaymentDecision()): a decision deferred within the last 24
    // hours is excluded here; once deferred_at is more than 24 hours
    // old, this same query naturally includes it again.
    const deferredCutoff = new Date(
        Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

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
            deferred_at,
            created_at,
            customers ( company_name ),
            invoices ( invoice_number )
        `
        )
        .eq("status", "pending")
        // Plain .neq() would NOT work here: PostgREST compiles it to SQL
        // `<>`, and under three-valued logic `NULL <> 'customer_not_found'`
        // is NULL (not true), which would silently drop every "ready"
        // (needs_review_reason IS NULL) awaiting-approval decision too.
        // Explicitly allowing IS NULL alongside != is the same OR-group
        // pattern already used for deferred_at below.
        .or("needs_review_reason.is.null,needs_review_reason.neq.customer_not_found")
        .or(`deferred_at.is.null,deferred_at.lte.${deferredCutoff}`)
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

    // A visible row with a non-null deferred_at can ONLY have gotten
    // here via the .or() cutoff filter above (deferred_at <= 24h ago) —
    // it is, by construction, exactly a "resurfaced after WAIT" row,
    // not a fresh never-deferred one (those have deferred_at IS NULL).
    const resurfacedRows = visibleRows.filter(
        (row) => row.deferred_at !== null
    );

    await logWaitCompletedForResurfacedDecisions(resurfacedRows);

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

        deferredAt: row.deferred_at,

        createdAt: row.created_at,
    }));
}
