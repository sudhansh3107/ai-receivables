import { supabase } from "@/lib/supabase";
import type {
    CaseFieldPatch,
    CaseState,
    CaseStatus,
} from "./collectionDecisionEngine";

// ---------------------------------------------------------------------
// Responsibility #3 (Collections & Follow-Up) — I/O primitives only.
// No decision logic lives here (that is entirely
// collectionDecisionEngine.ts's job); this file only ever reads/writes
// public.collection_cases, and every write is a conditional UPDATE
// keyed on an expected prior state — the same idempotency pattern
// already established throughout services/server/
// paymentDecisionExecutionService.ts (claimDecisionForExecution(),
// approvePaymentDecision(), deferPaymentDecision()), reused here rather
// than inventing a new concurrency mechanism.
// ---------------------------------------------------------------------

export interface CollectionCaseRow {
    id: string;
    customer_id: string;
    status: CaseStatus;
    opened_at: string;
    closed_at: string | null;
    closed_reason: string | null;
    triggering_invoice_id: string | null;
    opening_assessment_snapshot: Record<string, unknown>;
    last_decision: string | null;
    last_decision_reason: string | null;
    last_decision_at: string | null;
    last_action_at: string | null;
    next_evaluation_at: string;
    outreach_count: number;
    unanswered_outreach_count: number;
    last_outreach_at: string | null;
    last_response_at: string | null;
    last_response_classification: string | null;
    last_response_email_id: string | null;
    promise_amount: number | string | null;
    promise_currency: string | null;
    promise_date: string | null;
    promise_source_email_id: string | null;
    promise_confidence: number | string | null;
    promise_status: string | null;
    broken_promise_count: number;
    exception_category: string | null;
    exception_type: string | null;
    exception_status: string | null;
    exception_detail: string | null;
    exception_source_email_id: string | null;
    exception_opened_at: string | null;
    escalated_at: string | null;
    escalation_reason: string | null;
    escalation_evidence: Record<string, unknown> | null;
    escalation_deferred_at: string | null;
    created_at: string;
    updated_at: string;
}

// Maps a raw DB row into the decision engine's CaseState contract —
// the only place this shape translation happens, so
// collectionDecisionEngine.ts never has to know about column naming or
// string-vs-Date representation.
export function toCaseState(row: CollectionCaseRow): CaseState {
    return {
        id: row.id,
        customerId: row.customer_id,
        status: row.status,
        openedAt: new Date(row.opened_at),
        nextEvaluationAt: new Date(row.next_evaluation_at),
        outreachCount: row.outreach_count,
        unansweredOutreachCount: row.unanswered_outreach_count,
        lastOutreachAt: row.last_outreach_at
            ? new Date(row.last_outreach_at)
            : null,
        promiseAmount:
            row.promise_amount === null ? null : Number(row.promise_amount),
        promiseCurrency: row.promise_currency,
        promiseDate: row.promise_date,
        promiseConfidence:
            row.promise_confidence === null
                ? null
                : Number(row.promise_confidence),
        promiseStatus: row.promise_status as CaseState["promiseStatus"],
        brokenPromiseCount: row.broken_promise_count,
        exceptionCategory:
            row.exception_category as CaseState["exceptionCategory"],
        exceptionType: row.exception_type as CaseState["exceptionType"],
        exceptionStatus:
            row.exception_status as CaseState["exceptionStatus"],
        exceptionDetail: row.exception_detail,
        exceptionOpenedAt: row.exception_opened_at
            ? new Date(row.exception_opened_at)
            : null,
    };
}

// Converts a decision-engine field patch (camelCase, Date objects) into
// the snake_case/ISO-string shape Supabase expects. undefined fields
// are omitted entirely (not written), null fields ARE written (explicit
// clear) — this distinction matters for fields like promiseAmount.
function patchToRow(patch: CaseFieldPatch): Record<string, unknown> {
    const row: Record<string, unknown> = {
        status: patch.status,
        last_decision: patch.lastDecision,
        last_decision_reason: patch.lastDecisionReason,
        last_decision_at: patch.lastDecisionAt.toISOString(),
        next_evaluation_at: patch.nextEvaluationAt.toISOString(),
        updated_at: new Date().toISOString(),
    };

    if (patch.closedAt !== undefined) row.closed_at = patch.closedAt.toISOString();
    if (patch.closedReason !== undefined) row.closed_reason = patch.closedReason;
    if (patch.lastActionAt !== undefined) row.last_action_at = patch.lastActionAt.toISOString();

    if (patch.outreachCount !== undefined) row.outreach_count = patch.outreachCount;
    if (patch.unansweredOutreachCount !== undefined) row.unanswered_outreach_count = patch.unansweredOutreachCount;
    if (patch.lastOutreachAt !== undefined) row.last_outreach_at = patch.lastOutreachAt.toISOString();

    if (patch.lastResponseAt !== undefined) row.last_response_at = patch.lastResponseAt.toISOString();
    if (patch.lastResponseClassification !== undefined) row.last_response_classification = patch.lastResponseClassification;
    if (patch.lastResponseEmailId !== undefined) row.last_response_email_id = patch.lastResponseEmailId;

    if (patch.promiseAmount !== undefined) row.promise_amount = patch.promiseAmount;
    if (patch.promiseCurrency !== undefined) row.promise_currency = patch.promiseCurrency;
    if (patch.promiseDate !== undefined) row.promise_date = patch.promiseDate;
    if (patch.promiseSourceEmailId !== undefined) row.promise_source_email_id = patch.promiseSourceEmailId;
    if (patch.promiseConfidence !== undefined) row.promise_confidence = patch.promiseConfidence;
    if (patch.promiseStatus !== undefined) row.promise_status = patch.promiseStatus;
    if (patch.brokenPromiseCount !== undefined) row.broken_promise_count = patch.brokenPromiseCount;

    if (patch.exceptionCategory !== undefined) row.exception_category = patch.exceptionCategory;
    if (patch.exceptionType !== undefined) row.exception_type = patch.exceptionType;
    if (patch.exceptionStatus !== undefined) row.exception_status = patch.exceptionStatus;
    if (patch.exceptionDetail !== undefined) row.exception_detail = patch.exceptionDetail;
    if (patch.exceptionSourceEmailId !== undefined) row.exception_source_email_id = patch.exceptionSourceEmailId;
    if (patch.exceptionOpenedAt !== undefined) row.exception_opened_at = patch.exceptionOpenedAt ? patch.exceptionOpenedAt.toISOString() : null;

    if (patch.escalatedAt !== undefined) row.escalated_at = patch.escalatedAt.toISOString();
    if (patch.escalationReason !== undefined) row.escalation_reason = patch.escalationReason;
    if (patch.escalationEvidence !== undefined) row.escalation_evidence = patch.escalationEvidence;

    return row;
}

export async function getActiveCaseForCustomer(
    customerId: string
): Promise<CollectionCaseRow | null> {
    const { data, error } = await supabase
        .from("collection_cases")
        .select("*")
        .eq("customer_id", customerId)
        .neq("status", "resolved")
        .maybeSingle();

    if (error) throw error;

    return data as CollectionCaseRow | null;
}

export interface CustomerNeedingNewCase {
    id: string;
    companyName: string;
}

// Mirrors receivablesMonitoringService.ts::getCustomersMissingAssessment()'s
// fetch-relation-and-filter-client-side approach (PostgREST has no direct
// anti-join) — customers whose latest #2 assessment already warrants
// attention but who have no active collection case yet.
export async function getCustomersNeedingNewCase(
    limit = 25
): Promise<CustomerNeedingNewCase[]> {
    const { data, error } = await supabase
        .from("customers")
        .select(
            `
            id,
            company_name,
            customer_receivables_assessments!inner (
                assessment
            ),
            collection_cases (
                id,
                status
            )
        `
        )
        .in("customer_receivables_assessments.assessment", [
            "needs_attention",
            "critical",
        ]);

    if (error) throw error;

    interface Row {
        id: string;
        company_name: string;
        collection_cases: { id: string; status: string }[] | null;
    }

    const rows = (data ?? []) as unknown as Row[];

    return rows
        .filter(
            (row) =>
                !row.collection_cases ||
                row.collection_cases.every((c) => c.status === "resolved")
        )
        .slice(0, limit)
        .map((row) => ({ id: row.id, companyName: row.company_name }));
}

// Sweeps cases whose timer has elapsed. Escalated cases are deliberately
// excluded — they are human-owned until a human acts (or an autonomous
// payment resolution, handled separately via resolveCollectionCase(),
// which does not go through this query at all).
export async function getCasesDueForEvaluation(
    limit = 50
): Promise<CollectionCaseRow[]> {
    const { data, error } = await supabase
        .from("collection_cases")
        .select("*")
        .not("status", "in", "(resolved,escalated)")
        .lte("next_evaluation_at", new Date().toISOString())
        .order("next_evaluation_at", { ascending: true })
        .limit(limit);

    if (error) throw error;

    return (data ?? []) as CollectionCaseRow[];
}

export interface EscalatedCollectionCase {
    id: string;
    customerId: string;
    customerName: string | null;
    escalationReason: string | null;
    escalatedAt: string | null;
    outreachCount: number;
    unansweredOutreachCount: number;
    brokenPromiseCount: number;
    exceptionType: string | null;
    exceptionDetail: string | null;
}

interface EscalatedCollectionCaseRow {
    id: string;
    customer_id: string;
    escalation_reason: string | null;
    escalated_at: string | null;
    outreach_count: number;
    unanswered_outreach_count: number;
    broken_promise_count: number;
    exception_type: string | null;
    exception_detail: string | null;
    customers: { company_name: string } | null;
}

// Read-only display source for the collection-escalation decision-queue
// candidate builder — mirrors paymentDecisionService.ts::
// getPendingPaymentDecisions()'s defer-filter shape exactly: a case
// deferred ("keep monitoring") within the last DEFER_WINDOW_HOURS is
// excluded; once escalation_deferred_at is older than that, the same
// query naturally includes it again. No cron/poller drives this.
export async function getEscalatedCollectionCases(): Promise<
    EscalatedCollectionCase[]
> {
    const deferredCutoff = new Date(
        Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
        .from("collection_cases")
        .select(
            `
            id,
            customer_id,
            escalation_reason,
            escalated_at,
            outreach_count,
            unanswered_outreach_count,
            broken_promise_count,
            exception_type,
            exception_detail,
            customers ( company_name )
        `
        )
        .eq("status", "escalated")
        .or(
            `escalation_deferred_at.is.null,escalation_deferred_at.lte.${deferredCutoff}`
        )
        .order("escalated_at", { ascending: false });

    if (error) throw error;

    const rows = (data ?? []) as unknown as EscalatedCollectionCaseRow[];

    return rows.map((row) => ({
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customers?.company_name ?? null,
        escalationReason: row.escalation_reason,
        escalatedAt: row.escalated_at,
        outreachCount: row.outreach_count,
        unansweredOutreachCount: row.unanswered_outreach_count,
        brokenPromiseCount: row.broken_promise_count,
        exceptionType: row.exception_type,
        exceptionDetail: row.exception_detail,
    }));
}

// Idempotent open: relies on collection_cases_active_per_customer_idx
// (a partial unique index on customer_id WHERE status <> 'resolved') to
// enforce "at most one active case per customer" at the database level.
// A concurrent duplicate INSERT hits that constraint (Postgres error
// code 23505) — treated as an expected, harmless race, not an error:
// the existing active case is fetched and returned instead.
export async function openCollectionCase(
    customerId: string,
    openingAssessmentSnapshot: Record<string, unknown>,
    triggeringInvoiceId: string | null
): Promise<CollectionCaseRow> {
    const now = new Date();

    const { data, error } = await supabase
        .from("collection_cases")
        .insert({
            customer_id: customerId,
            status: "open",
            opened_at: now.toISOString(),
            opening_assessment_snapshot: openingAssessmentSnapshot,
            triggering_invoice_id: triggeringInvoiceId,
            next_evaluation_at: now.toISOString(),
            outreach_count: 0,
            unanswered_outreach_count: 0,
            broken_promise_count: 0,
        })
        .select()
        .single();

    if (error) {
        if (error.code === "23505") {
            const existing = await getActiveCaseForCustomer(customerId);

            if (existing) return existing;
        }

        throw error;
    }

    return data as CollectionCaseRow;
}

// Concurrency-safe claim: a soft, self-expiring lock (1 hour) via a
// conditional UPDATE, the same mechanism payment_decisions.ts uses for
// its "claim for execution" step — not a database transaction/row lock,
// but sufficient because the only contention this needs to close is two
// overlapping evaluation passes for the SAME case (backfill sweep vs.
// event-driven email reply, or two overlapping cron invocations).
// Escalated and resolved cases are never claimable — an escalated case
// is human-owned until a human acts or an autonomous payment resolution
// runs (via resolveCollectionCase(), which bypasses this claim
// entirely).
export async function claimCaseForEvaluation(
    caseId: string
): Promise<CollectionCaseRow | null> {
    const now = new Date();
    const lockUntil = new Date(now.getTime() + 60 * 60 * 1000);

    const { data, error } = await supabase
        .from("collection_cases")
        .update({
            next_evaluation_at: lockUntil.toISOString(),
            updated_at: now.toISOString(),
        })
        .eq("id", caseId)
        .lte("next_evaluation_at", now.toISOString())
        .not("status", "in", "(resolved,escalated)")
        .select()
        .maybeSingle();

    if (error) throw error;

    return data as CollectionCaseRow | null;
}

// Applies the decision engine's output. Conditional on the case still
// being in the exact status the decision was computed from — zero rows
// affected means the state moved concurrently since the claim (should
// not happen given claimCaseForEvaluation's own guard, but this is the
// defense-in-depth backstop, same pattern as approvePaymentDecision()'s
// WHERE status='pending' guard).
export class CaseTransitionConflictError extends Error {
    constructor(caseId: string, expectedStatus: string) {
        super(
            `Collection case ${caseId} cannot be updated: expected status "${expectedStatus}" no longer matches (concurrent transition).`
        );
        this.name = "CaseTransitionConflictError";
    }
}

export async function applyCaseTransition(
    caseId: string,
    expectedStatus: CaseStatus,
    patch: CaseFieldPatch
): Promise<CollectionCaseRow> {
    const { data, error } = await supabase
        .from("collection_cases")
        .update(patchToRow(patch))
        .eq("id", caseId)
        .eq("status", expectedStatus)
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        throw new CaseTransitionConflictError(caseId, expectedStatus);
    }

    return data as CollectionCaseRow;
}

// The ONLY autonomous exit from status='escalated' — payment/invoice
// resolution, checked independently of (and callable without) the
// claim/evaluate pipeline above, so it applies even to a case a human
// hasn't yet acted on. Conditional UPDATE (WHERE status <> 'resolved'),
// safe to call redundantly from both paymentService.ts's recordPayment()
// chain and the backfill sweep converging on the same case.
export async function resolveCollectionCase(
    customerId: string,
    closedReason: "resolved_paid" | "resolved_no_exposure"
): Promise<CollectionCaseRow | null> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from("collection_cases")
        .update({
            status: "resolved",
            closed_at: now,
            closed_reason: closedReason,
            last_decision: "resolve",
            last_decision_reason:
                closedReason === "resolved_paid"
                    ? "Customer has no remaining outstanding balance following a recorded payment."
                    : "Customer has no remaining outstanding balance (invoice cancelled, credited, or otherwise settled).",
            last_decision_at: now,
            next_evaluation_at: now,
            updated_at: now,
        })
        .eq("customer_id", customerId)
        .neq("status", "resolved")
        .select()
        .maybeSingle();

    if (error) throw error;

    return data as CollectionCaseRow | null;
}

// --- Human actions (decision-queue endpoints) --------------------------

export async function resumeCollectionCaseFromEscalation(
    caseId: string
): Promise<CollectionCaseRow> {
    const now = new Date().toISOString();

    const { data: existing, error: fetchError } = await supabase
        .from("collection_cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existing) {
        throw new Error(`Collection case ${caseId} not found`);
    }

    if (existing.status !== "escalated") {
        throw new Error(
            `Collection case ${caseId} cannot be resumed: status is "${existing.status}", not "escalated"`
        );
    }

    const destinationStatus: CaseStatus =
        existing.outreach_count > 0 ? "awaiting_response" : "open";

    const { data, error } = await supabase
        .from("collection_cases")
        .update({
            status: destinationStatus,
            next_evaluation_at: now,
            escalation_deferred_at: null,
            exception_status: existing.exception_category
                ? "resolved"
                : existing.exception_status,
            updated_at: now,
        })
        .eq("id", caseId)
        .eq("status", "escalated")
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        throw new CaseTransitionConflictError(caseId, "escalated");
    }

    return data as CollectionCaseRow;
}

export async function markCollectionCaseResolvedManually(
    caseId: string
): Promise<CollectionCaseRow> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from("collection_cases")
        .update({
            status: "resolved",
            closed_at: now,
            closed_reason: "resolved_manual",
            last_decision: "resolve",
            last_decision_reason: "Manually resolved by a human reviewer.",
            last_decision_at: now,
            next_evaluation_at: now,
            updated_at: now,
        })
        .eq("id", caseId)
        .eq("status", "escalated")
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        throw new CaseTransitionConflictError(caseId, "escalated");
    }

    return data as CollectionCaseRow;
}

export type DeferCollectionCaseResult =
    | { outcome: "deferred"; case: CollectionCaseRow }
    | { outcome: "already_deferred"; case: CollectionCaseRow };

// "Keep monitoring" — mirrors paymentDecisionExecutionService.ts::
// deferPaymentDecision() exactly: not a status change, only stamps
// escalation_deferred_at so the case drops out of the decision-queue
// candidate list for 24 hours (see getEscalatedCollectionCases()'s
// query-time filter, the only resurfacing mechanism — no cron/poller).
export async function deferCollectionCaseEscalation(
    caseId: string
): Promise<DeferCollectionCaseResult> {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const { data, error } = await supabase
        .from("collection_cases")
        .update({
            escalation_deferred_at: now,
            updated_at: now,
        })
        .eq("id", caseId)
        .eq("status", "escalated")
        .or(`escalation_deferred_at.is.null,escalation_deferred_at.lte.${cutoff}`)
        .select()
        .maybeSingle();

    if (error) throw error;

    if (data) {
        return { outcome: "deferred", case: data as CollectionCaseRow };
    }

    const { data: existing, error: fetchError } = await supabase
        .from("collection_cases")
        .select("*")
        .eq("id", caseId)
        .maybeSingle();

    if (fetchError) throw fetchError;

    if (!existing) {
        throw new Error(`Collection case ${caseId} not found`);
    }

    if (existing.status !== "escalated") {
        throw new Error(
            `Collection case ${caseId} cannot be deferred: status is "${existing.status}", not "escalated"`
        );
    }

    return {
        outcome: "already_deferred",
        case: existing as CollectionCaseRow,
    };
}
