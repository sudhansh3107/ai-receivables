import { supabase } from "@/lib/supabase";
import { recordPayment } from "./paymentService";
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

// Human approval step. Only a decision still in its untouched "pending"
// state can be approved — this is a plain conditional UPDATE, so
// approving twice, or approving a rejected decision, fails loudly
// instead of silently no-opping.
export async function approvePaymentDecision(
    decisionId: string
): Promise<PaymentDecisionRow> {
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

    const decision = data as PaymentDecisionRow;

    await logActivity({
        invoiceId: decision.invoice_id,
        customerId: decision.customer_id ?? undefined,
        activityType: ActivityTypes.PAYMENT_DECISION_APPROVED,
        description: `Payment decision approved for invoice ${describeInvoice(
            decision
        )} (${formatProposedAmount(decision)})`,
        metadata: {
            decisionId: decision.id,
            proposedAmount: decision.proposed_amount,
            proposedCurrency: decision.proposed_currency,
        },
    });

    return decision;
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

export type PaymentDecisionExecutionResult =
    | {
          outcome: "executed";
          decision: PaymentDecisionRow;
          payment: Payment;
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
