import { supabase } from "@/lib/supabase";
import {
    recordPayment,
    getInvoice,
    getTotalPayments,
    calculateInvoiceBalance,
    PaymentRecordingRejectedError,
} from "./paymentService";
import { logActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";
import { PaymentMethod } from "@/lib/paymentMethods";

// Human approval and system execution for payment_decisions rows
// created by services/server/paymentDecisionService.ts::
// persistPaymentDecision(). This is the ONLY place allowed to move a
// decision's status to "approved" or its execution_status away from
// "not_executed" — persistPaymentDecision() explicitly refuses to.

export interface PaymentDecisionRow {
    id: string;
    email_id: string;
    customer_id: string | null;
    invoice_id: string | null;
    payment_id: string | null;
    status: "pending" | "approved" | "rejected";
    execution_status:
        | "not_executed"
        | "executing"
        | "executed"
        | "execution_failed";
    needs_review_reason: string | null;
    resolution_reason: string | null;
    proposed_amount: number | null;
    proposed_currency: string | null;
    proposed_payment_date: string | null;
    proposed_invoice_number: string | null;
    proposed_payment_reference: string | null;
    extraction_confidence: number | null;
    match_evidence: unknown;
    execution_error: string | null;
    approved_at: string | null;
    rejected_at: string | null;
    executed_at: string | null;
    deferred_at: string | null;
    created_at: string;
    updated_at: string;
}

type Payment = Awaited<ReturnType<typeof recordPayment>>;

async function getPaymentDecisionById(
    decisionId: string
): Promise<PaymentDecisionRow | null> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .select("*")
        .eq("id", decisionId)
        .maybeSingle();

    if (error) throw error;

    return data as PaymentDecisionRow | null;
}

function formatProposedAmount(decision: PaymentDecisionRow): string {
    if (decision.proposed_amount == null) return "an unknown amount";

    const currency = decision.proposed_currency ?? "";

    return `${currency} ${decision.proposed_amount}`.trim();
}

function describeInvoice(decision: PaymentDecisionRow): string {
    return (
        decision.proposed_invoice_number ??
        decision.invoice_id ??
        "unknown invoice"
    );
}

// Resolves a still-pending decision as stale because the invoice it
// targets is already fully settled. Reuses the existing "rejected"
// status (no code path wrote it before this) plus the new
// resolution_reason column. execution_status, deferred_at, and
// needs_review_reason are deliberately left untouched. Guarded by the
// same WHERE status='pending' pattern as the approval UPDATE below, so
// this can never silently overwrite a decision that moved on
// concurrently.
async function resolveDecisionAsAlreadySettled(
    decisionId: string
): Promise<PaymentDecisionRow> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            status: "rejected",
            rejected_at: new Date().toISOString(),
            resolution_reason: "invoice_already_settled",
            updated_at: new Date().toISOString(),
        })
        .eq("id", decisionId)
        .eq("status", "pending")
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const existing = await getPaymentDecisionById(decisionId);

        if (!existing) {
            throw new Error(`Payment decision ${decisionId} not found`);
        }

        throw new Error(
            `Payment decision ${decisionId} cannot be resolved: status is "${existing.status}", not "pending"`
        );
    }

    return data as PaymentDecisionRow;
}

// Flags a still-pending decision as an overpayment risk without
// approving or rejecting it — a human still needs to decide. Reuses
// the exact "overpayment" needs_review_reason that matchPaymentEmail()
// already writes for the identical condition (proposed amount exceeds
// available balance) at match time; no new reason is invented.
async function flagDecisionAsOverpayment(
    decisionId: string
): Promise<PaymentDecisionRow> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            needs_review_reason: "overpayment",
            updated_at: new Date().toISOString(),
        })
        .eq("id", decisionId)
        .eq("status", "pending")
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const existing = await getPaymentDecisionById(decisionId);

        if (!existing) {
            throw new Error(`Payment decision ${decisionId} not found`);
        }

        throw new Error(
            `Payment decision ${decisionId} cannot be flagged: status is "${existing.status}", not "pending"`
        );
    }

    return data as PaymentDecisionRow;
}

export type PaymentDecisionApprovalResult =
    | {
          outcome: "approved";
          decision: PaymentDecisionRow;
      }
    | {
          outcome: "already_paid";
          decision: PaymentDecisionRow;
      }
    | {
          outcome: "needs_review";
          decision: PaymentDecisionRow;
          reason: "overpayment";
          currentBalance: number;
      };

// Human approval step, with approval-time financial revalidation: the
// decision's proposed amount is checked against the invoice's CURRENT
// balance (via the existing getInvoice/getTotalPayments/
// calculateInvoiceBalance primitives — never reimplemented here)
// before pending -> approved is allowed to happen. This closes the
// common, non-racing case where a decision has gone stale by the time
// a human clicks Approve (e.g. another payment already settled the
// invoice). It is NOT a substitute for execution-time safety: two
// approvals could still theoretically race with execution, and a true
// concurrent double-execution race is only closed by (future)
// execution-time revalidation — approval revalidation and execution
// safety are deliberately separate concerns.
//
// Order is load-then-validate-then-write, never write-then-validate:
// load decision -> verify pending -> load invoice -> load payments ->
// calculate balance -> validate proposed amount -> transition.
export async function approvePaymentDecision(
    decisionId: string
): Promise<PaymentDecisionApprovalResult> {
    const decision = await getPaymentDecisionById(decisionId);

    if (!decision) {
        throw new Error(`Payment decision ${decisionId} not found`);
    }

    if (decision.status !== "pending") {
        throw new Error(
            `Payment decision ${decisionId} cannot be approved: status is "${decision.status}", not "pending"`
        );
    }

    if (!decision.invoice_id) {
        throw new Error(
            `Payment decision ${decisionId} cannot be approved: no invoice is associated with this decision`
        );
    }

    // getInvoice() throws if the invoice no longer exists — propagated
    // as-is (CASE D), matching the existing route's error handling
    // rather than inventing a stale/already-paid interpretation for a
    // missing invoice.
    const invoice = await getInvoice(decision.invoice_id);

    const totalPaid = await getTotalPayments(decision.invoice_id);

    const { balanceDue } = calculateInvoiceBalance(
        Number(invoice.invoice_amount),
        totalPaid
    );

    // CASE A — already settled: nothing remains to pay, regardless of
    // what the source email claimed. Resolved as stale, never
    // approved, no payment created.
    if (balanceDue <= 0) {
        const resolved = await resolveDecisionAsAlreadySettled(decisionId);

        return {
            outcome: "already_paid",
            decision: resolved,
        };
    }

    // CASE B — proposed amount exceeds what remains: an
    // overlapping/overpayment-risk situation, not "already settled".
    // Decision stays pending; a human still needs to resolve it.
    if (
        decision.proposed_amount != null &&
        Number(decision.proposed_amount) > balanceDue
    ) {
        const flagged = await flagDecisionAsOverpayment(decisionId);

        return {
            outcome: "needs_review",
            decision: flagged,
            reason: "overpayment",
            currentBalance: balanceDue,
        };
    }

    // CASE C — proposed amount fits the current balance: proceed with
    // the existing approval transition, unchanged (same conditional
    // UPDATE, same guard, same Activity Feed event).
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            status: "approved",
            approved_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        })
        .eq("id", decisionId)
        .eq("status", "pending")
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const existing = await getPaymentDecisionById(decisionId);

        if (!existing) {
            throw new Error(`Payment decision ${decisionId} not found`);
        }

        throw new Error(
            `Payment decision ${decisionId} cannot be approved: status is "${existing.status}", not "pending"`
        );
    }

    const approvedDecision = data as PaymentDecisionRow;

    await logActivity({
        invoiceId: approvedDecision.invoice_id,
        customerId: approvedDecision.customer_id ?? undefined,
        activityType: ActivityTypes.PAYMENT_DECISION_APPROVED,
        description: `Payment decision approved for invoice ${describeInvoice(
            approvedDecision
        )} (${formatProposedAmount(approvedDecision)})`,
        metadata: {
            decisionId: approvedDecision.id,
            proposedAmount: approvedDecision.proposed_amount,
            proposedCurrency: approvedDecision.proposed_currency,
        },
    });

    return {
        outcome: "approved",
        decision: approvedDecision,
    };
}

// Concurrency-safe claim: atomically transitions exactly one eligible
// decision from not_executed to executing via a conditional UPDATE
// (WHERE status='approved' AND execution_status='not_executed'). If
// zero rows match, the decision either doesn't exist, isn't approved,
// or has already been claimed/executed by a concurrent call — in every
// case throwing here (instead of proceeding) is what prevents two
// concurrent execute calls from both calling recordPayment() for the
// same decision (double payment recording).
async function claimDecisionForExecution(
    decisionId: string
): Promise<PaymentDecisionRow> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            execution_status: "executing",
            updated_at: new Date().toISOString(),
        })
        .eq("id", decisionId)
        .eq("status", "approved")
        .eq("execution_status", "not_executed")
        .select()
        .maybeSingle();

    if (error) throw error;

    if (data) return data as PaymentDecisionRow;

    const existing = await getPaymentDecisionById(decisionId);

    if (!existing) {
        throw new Error(`Payment decision ${decisionId} not found`);
    }

    if (existing.status !== "approved") {
        throw new Error(
            `Payment decision ${decisionId} cannot execute: status is "${existing.status}", not "approved"`
        );
    }

    throw new Error(
        `Payment decision ${decisionId} cannot execute: execution_status is "${existing.execution_status}", not "not_executed"`
    );
}

// Resolves a CLAIMED decision (status='approved', execution_status=
// 'executing') as stale because the invoice it targets is already
// fully settled by the time execution actually ran. This is the
// execution-time counterpart of resolveDecisionAsAlreadySettled()
// above, but it is NOT the same function and must not be merged with
// it: that one resolves a still-PENDING decision (approved_at is null
// at that point, so setting rejected_at is safe), while this one
// resolves an ALREADY-APPROVED decision (approved_at is already set
// from the earlier approval). payment_decisions_single_outcome_check
// forbids approved_at and rejected_at both being non-null, so
// rejected_at is deliberately left untouched here — the decision's
// history correctly still shows it was approved, then later
// invalidated by execution-time revalidation. execution_status is
// reset to 'not_executed' (never 'executed' or 'execution_failed')
// because payment_decisions_execution_requires_approval_check requires
// execution_status='not_executed' whenever status is not 'approved' —
// 'rejected' + any other execution_status would be an impossible,
// constraint-violating combination. needs_review_reason is left
// untouched, matching the approval-time behavior.
async function resolveClaimedDecisionAsAlreadySettled(
    decisionId: string
): Promise<PaymentDecisionRow> {
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            status: "rejected",
            resolution_reason: "invoice_already_settled",
            execution_status: "not_executed",
            updated_at: new Date().toISOString(),
        })
        .eq("id", decisionId)
        .eq("execution_status", "executing")
        .select()
        .maybeSingle();

    if (error) throw error;

    if (!data) {
        const existing = await getPaymentDecisionById(decisionId);

        if (!existing) {
            throw new Error(`Payment decision ${decisionId} not found`);
        }

        throw new Error(
            `Payment decision ${decisionId} cannot be resolved: execution_status is "${existing.execution_status}", not "executing"`
        );
    }

    return data as PaymentDecisionRow;
}

// Flags a CLAIMED decision's needs_review_reason as an overpayment risk
// (reusing the exact same "overpayment" reason used at match time and
// approval time — no new reason invented). Deliberately does NOT touch
// status or execution_status itself: the caller throws immediately
// after this so the existing execution_failed/error path (below, in
// the catch block) performs the actual state transition and Activity
// Feed logging, exactly as it already does for every other execution
// failure — this avoids a second, parallel "failure" code path.
async function flagClaimedDecisionAsOverpayment(
    decisionId: string
): Promise<void> {
    const { error } = await supabase
        .from("payment_decisions")
        .update({
            needs_review_reason: "overpayment",
            updated_at: new Date().toISOString(),
        })
        .eq("id", decisionId)
        .eq("execution_status", "executing");

    if (error) throw error;
}

export type PaymentDecisionExecutionResult =
    | {
          outcome: "executed";
          decision: PaymentDecisionRow;
          payment: Payment;
      }
    | {
          outcome: "already_paid";
          decision: PaymentDecisionRow;
      }
    | {
          outcome: "execution_failed";
          decision: PaymentDecisionRow;
          error: string;
      };

// System execution step. Must only ever be invoked for an
// already-approved decision at a human's request (e.g. an "Execute"
// action after approval) — never automatically as a side effect of AI
// classification or matching. claimDecisionForExecution() is the
// enforcement point for both the approval boundary and the
// double-execution guard.
//
// On success: recordPayment() creates/links the payment and, as part
// of its own existing behavior, reconciles the invoice (balance_due /
// status) and refreshes customer insights — reused as-is, not
// reimplemented here. The decision is then marked executed and linked
// to the payment.
//
// On failure: the decision is marked execution_failed with the error
// persisted, never left silently as "executing" or misreported as
// executed.
//
// Execution-time financial revalidation: approval-time revalidation
// (approvePaymentDecision()) already checks the balance once, but the
// invoice can still change between approval and execution (another
// decision executing first, a manually recorded payment, etc.) — this
// is the second, independent check, immediately before recordPayment()
// is ever called, using the exact same getInvoice/getTotalPayments/
// calculateInvoiceBalance primitives (never reimplemented). This
// closes the SEQUENTIAL stale-approval race (approve A -> balance
// changes -> execute A now correctly catches it). It does NOT close a
// TRUE CONCURRENT race: if two already-approved decisions' execute
// calls both read the balance before either writes, both could still
// pass this check and both call recordPayment() — see the function's
// final report for why closing that fully requires a database-level
// transaction/lock, which is explicitly out of scope for this change.
export async function executePaymentDecision(
    decisionId: string
): Promise<PaymentDecisionExecutionResult> {
    const decision = await claimDecisionForExecution(decisionId);

    try {
        if (
            !decision.invoice_id ||
            !decision.customer_id ||
            decision.proposed_amount == null ||
            !decision.proposed_payment_date
        ) {
            throw new Error(
                "Payment decision is missing required facts (customer, invoice, amount, or payment date) and cannot be executed"
            );
        }

        // getInvoice() throws if the invoice no longer exists (CASE D)
        // and getTotalPayments() throws on a failed read (CASE E) —
        // both propagate to the catch block below exactly like any
        // other execution failure: fails closed, recordPayment() is
        // never reached, execution_status becomes execution_failed
        // with the real error preserved, never silently treated as
        // "already paid" or as zero payments.
        const invoice = await getInvoice(decision.invoice_id);

        const totalPaid = await getTotalPayments(decision.invoice_id);

        const { balanceDue } = calculateInvoiceBalance(
            Number(invoice.invoice_amount),
            totalPaid
        );

        // CASE A — already settled by the time execution actually ran:
        // stale, not a failure. Resolved via a dedicated return (not a
        // thrown error) so this never gets mislabeled execution_failed
        // or logged as one.
        if (balanceDue <= 0) {
            const resolved = await resolveClaimedDecisionAsAlreadySettled(
                decisionId
            );

            return {
                outcome: "already_paid",
                decision: resolved,
            };
        }

        // CASE B — proposed amount exceeds what remains right now: an
        // overpayment risk discovered at execution time. Flags the
        // existing "overpayment" needs_review_reason, then throws so
        // the existing execution_failed/error path below performs the
        // actual state transition and Activity Feed logging — no
        // payment is recorded, no separate failure code path is added.
        if (Number(decision.proposed_amount) > balanceDue) {
            await flagClaimedDecisionAsOverpayment(decisionId);

            throw new Error(
                `Proposed amount (${decision.proposed_amount}) exceeds the invoice's current balance (${balanceDue}); execution blocked to prevent overpayment`
            );
        }

        // CASE C — proposed amount fits the current balance: proceed
        // exactly as before. Amount and reconciliation logic unchanged.
        const payment = await recordPayment({
            invoiceId: decision.invoice_id,
            customerId: decision.customer_id,
            amount: Number(decision.proposed_amount),
            paymentDate: new Date(decision.proposed_payment_date),
            paymentMethod: PaymentMethod.OTHER,
            paymentReference: decision.proposed_payment_reference ?? undefined,
            notes: `Recorded via approved payment decision ${decision.id}`,
        });

        const { data: executedData, error } = await supabase
            .from("payment_decisions")
            .update({
                execution_status: "executed",
                executed_at: new Date().toISOString(),
                payment_id: payment.id,
                execution_error: null,
                updated_at: new Date().toISOString(),
            })
            .eq("id", decision.id)
            .eq("execution_status", "executing")
            .select()
            .single();

        if (error) throw error;

        const executedDecision = executedData as PaymentDecisionRow;

        await logActivity({
            invoiceId: executedDecision.invoice_id,
            customerId: executedDecision.customer_id ?? undefined,
            activityType: ActivityTypes.PAYMENT_DECISION_EXECUTED,
            description: `Payment decision executed for invoice ${describeInvoice(
                executedDecision
            )} — ${formatProposedAmount(executedDecision)} recorded`,
            metadata: {
                decisionId: executedDecision.id,
                paymentId: payment.id,
            },
        });

        return {
            outcome: "executed",
            decision: executedDecision,
            payment,
        };
    } catch (err) {
        // recordPayment() itself now performs the final, authoritative
        // balance revalidation (atomically, under a database row lock —
        // see public.record_payment_atomic()), so it can reject a
        // payment even after this function's own pre-check (above)
        // passed — specifically in the concurrent race that pre-check
        // alone cannot close (two already-approved decisions both pass
        // the pre-check before either writes). This is the backstop:
        // it must still route to the SAME outcomes the pre-check itself
        // would have produced, so the decision is never left claiming
        // to be "executed" when no payment was actually written.
        if (err instanceof PaymentRecordingRejectedError) {
            if (err.reason === "already_paid") {
                const resolved = await resolveClaimedDecisionAsAlreadySettled(
                    decisionId
                );

                return {
                    outcome: "already_paid",
                    decision: resolved,
                };
            }

            if (err.reason === "overpayment") {
                await flagClaimedDecisionAsOverpayment(decisionId);
            }

            // invoice_not_found and any other reason fall through to
            // the existing execution_failed handling below, unchanged.
        }

        const message = err instanceof Error ? err.message : String(err);

        const { data: failedData, error } = await supabase
            .from("payment_decisions")
            .update({
                execution_status: "execution_failed",
                execution_error: message,
                updated_at: new Date().toISOString(),
            })
            .eq("id", decision.id)
            .eq("execution_status", "executing")
            .select()
            .maybeSingle();

        if (error) throw error;

        const failedDecision = (failedData as PaymentDecisionRow | null) ?? decision;

        await logActivity({
            invoiceId: decision.invoice_id,
            customerId: decision.customer_id ?? undefined,
            activityType: ActivityTypes.PAYMENT_DECISION_EXECUTION_FAILED,
            description: `Payment decision execution failed for invoice ${describeInvoice(
                decision
            )}: ${message}`,
            metadata: {
                decisionId: decision.id,
                error: message,
            },
        });

        return {
            outcome: "execution_failed",
            decision: failedDecision,
            error: message,
        };
    }
}
