import { supabase } from "@/lib/supabase";
import { logActivity, logInvoiceActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";
import { InvoiceStatus, type InvoiceStatusType } from "@/lib/invoiceStatus";
import { type PaymentMethodType } from "@/lib/paymentMethods";
import { toLocalDateString } from "@/lib/date";
import {
    refreshCustomerInsights,
} from "./customerInsightService";
import { resolvePaymentDecisionsForSettledInvoice } from "./paymentDecisionService";


export interface RecordPaymentInput {
    invoiceId: string;
    customerId: string;

    amount: number;

    paymentDate: Date;

    paymentMethod: PaymentMethodType;

    paymentReference?: string;

    notes?: string;
}

export async function getInvoice(invoiceId: string) {
    const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function getTotalPayments(invoiceId: string) {
    const { data, error } = await supabase
        .from("payments")
        .select("amount")
        .eq("invoice_id", invoiceId);

    if (error) {
        throw error;
    }

    return data.reduce(
        (total, payment) => total + Number(payment.amount),
        0
    );
}

export function calculateInvoiceBalance(
    invoiceAmount: number,
    totalPaid: number
) {
    const balanceDue = Math.max(invoiceAmount - totalPaid, 0);

    const status: InvoiceStatusType =
        balanceDue === 0
            ? InvoiceStatus.PAID
            : balanceDue < invoiceAmount
            ? InvoiceStatus.PARTIAL
            : InvoiceStatus.PENDING;

    return {
        balanceDue,
        status,
    };
}

// Thrown by recordPayment() when the database-level revalidation
// inside public.record_payment_atomic() (see the migration adding it)
// determines a payment must NOT be recorded — either because the
// invoice's current balance is already zero (checked under a row
// lock, so this is authoritative even against a concurrent writer) or
// because the proposed amount exceeds what remains. Distinguishable
// from a generic thrown error so callers that need to (e.g.
// executePaymentDecision()) can react precisely instead of treating
// every failure the same way; callers that don't care (e.g.
// POST /api/payments) can keep treating it as any other thrown error —
// `message` is always a clear, user-facing description.
export class PaymentRecordingRejectedError extends Error {
    constructor(
        public readonly reason:
            | "already_paid"
            | "overpayment"
            | "invoice_not_found",
        public readonly currentBalance: number | null,
        message: string
    ) {
        super(message);
        this.name = "PaymentRecordingRejectedError";
    }
}

type RecordPaymentRpcResult =
    | {
          outcome: "recorded";
          payment: Record<string, unknown>;
          balanceDue: number;
          status: InvoiceStatusType;
          invoiceNumber: string;
      }
    | {
          outcome: "already_paid";
          currentBalance: number;
      }
    | {
          outcome: "overpayment";
          currentBalance: number;
      }
    | {
          outcome: "invoice_not_found";
      };

// Payment recording, with the invoice's outstanding balance validated
// and reconciled atomically under a database row lock — the final,
// authoritative safety boundary (see public.record_payment_atomic() in
// supabase/migrations/20260811140000_add_record_payment_atomic_function.sql).
// This closes the concurrent race that application-level pre-checks
// (approval-time and execution-time revalidation in
// paymentDecisionExecutionService.ts) cannot: two callers reading the
// same balance before either writes can no longer both succeed, since
// the second caller's transaction blocks on the invoice row lock until
// the first commits, then re-reads the now-current balance.
//
// getInvoice/getTotalPayments/calculateInvoiceBalance are NOT called
// here — the RPC performs the equivalent logic itself, inside the
// lock, so this function has exactly one source of truth for the
// balance calculation at write time (those three exports remain used
// elsewhere, for the separate application-level pre-checks).
//
// Best-effort, isolated in its own try/catch: by the time this runs,
// record_payment_atomic() has already committed the real payment — a
// reconciliation failure must NEVER be reported back to the caller as
// "failed to record payment" (that already succeeded), and must never
// retry/re-send anything. Mirrors the same isolation pattern already
// used elsewhere in this codebase for post-write side effects (e.g.
// emailProcessingService.ts's payment-decision persistence, and
// paymentProofRequestService.ts's post-send activity logging).
async function reconcilePaymentDecisions(
    invoiceId: string,
    invoiceNumber: string
): Promise<void> {
    try {
        const resolved = await resolvePaymentDecisionsForSettledInvoice(
            invoiceId
        );

        for (const decision of resolved) {
            try {
                await logActivity({
                    invoiceId: decision.invoiceId,
                    customerId: decision.customerId ?? undefined,
                    activityType: ActivityTypes.PAYMENT_DECISION_RESOLVED,
                    description: `Payment decision resolved because invoice ${invoiceNumber} is fully paid.`,
                    metadata: {
                        decisionId: decision.id,
                        invoiceId: decision.invoiceId,
                        customerId: decision.customerId,
                        invoiceNumber,
                        resolutionReason: "invoice_already_settled",
                    },
                });
            } catch (activityError) {
                console.error(
                    "Payment Decision Reconciliation - activity logging failed for decision:",
                    decision.id,
                    activityError
                );
            }
        }
    } catch (error) {
        console.error(
            "Payment Decision Reconciliation - failed for invoice:",
            invoiceId,
            error
        );
    }
}

export async function recordPayment(
    input: RecordPaymentInput
) {
    const { data, error } = await supabase.rpc(
        "record_payment_atomic",
        {
            p_invoice_id: input.invoiceId,
            p_customer_id: input.customerId,
            p_amount: input.amount,
            p_payment_date: input.paymentDate.toISOString(),
            p_payment_method: input.paymentMethod,
            p_payment_reference: input.paymentReference ?? null,
            p_notes: input.notes ?? null,
        }
    );

    if (error) {
        throw error;
    }

    const result = data as RecordPaymentRpcResult;

    if (result.outcome === "invoice_not_found") {
        throw new PaymentRecordingRejectedError(
            "invoice_not_found",
            null,
            `Invoice ${input.invoiceId} not found`
        );
    }

    if (result.outcome === "already_paid") {
        throw new PaymentRecordingRejectedError(
            "already_paid",
            result.currentBalance ?? 0,
            "Invoice is already fully paid; no payment recorded"
        );
    }

    if (result.outcome === "overpayment") {
        throw new PaymentRecordingRejectedError(
            "overpayment",
            result.currentBalance ?? 0,
            `Proposed amount (${input.amount}) exceeds the invoice's current balance (${result.currentBalance}); no payment recorded`
        );
    }

    const payment = result.payment;
    const balanceDue = result.balanceDue;
    const status = result.status;

    const metadata = {
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        remainingBalance: balanceDue,
    };

    if (status === InvoiceStatus.PAID) {
    await logInvoiceActivity(
        input.invoiceId,
        input.customerId,
        ActivityTypes.INVOICE_PAID,
        `Invoice ${result.invoiceNumber} paid in full`,
        metadata
    );

    // Write-time reconciliation: the invoice this payment settled may
    // have pending payment_decisions (unmatched customer claims) —
    // now that it's fully paid, none of them require human attention
    // anymore. See reconcilePaymentDecisions() above; resolution is
    // invoice-level (ALL pending decisions for this invoice), never
    // attempts to attribute this specific payment to one claim.
    await reconcilePaymentDecisions(
        input.invoiceId,
        result.invoiceNumber
    );
} else {
    await logInvoiceActivity(
        input.invoiceId,
        input.customerId,
        ActivityTypes.PAYMENT_RECORDED,
        `Payment of ${input.amount} recorded`,
        metadata
    );
}

console.log("🧠 Refreshing Customer Insights...");

await refreshCustomerInsights(
    input.customerId
);

console.log("🧠 Customer Insights Updated");

return payment;
}

/* ---------------------------------------------------------- */
/* Dashboard Metrics Helpers */
/* ---------------------------------------------------------- */

function getMonthRange(monthOffset = 0) {
    const today = new Date();

    const start = new Date(
        today.getFullYear(),
        today.getMonth() + monthOffset,
        1
    );

    const end = new Date(
        today.getFullYear(),
        today.getMonth() + monthOffset + 1,
        1
    );

    return {
        start,
        end,
    };
}

export async function getRecoveredThisMonth(): Promise<number> {
    const today = new Date();

    const start = new Date(
        today.getFullYear(),
        today.getMonth(),
        1
    );

    const startDate = `${start.getFullYear()}-${String(
        start.getMonth() + 1
    ).padStart(2, "0")}-${String(
        start.getDate()
    ).padStart(2, "0")}`;

    const todayDate = `${today.getFullYear()}-${String(
        today.getMonth() + 1
    ).padStart(2, "0")}-${String(
        today.getDate()
    ).padStart(2, "0")}`;

    const { data, error } = await supabase
        .from("payments")
        .select("payment_date, amount")
        .gte("payment_date", startDate)
        .lte("payment_date", todayDate);

    if (error) throw error;

    console.table(data);

    const total = data.reduce(
        (sum, p) => sum + Number(p.amount),
        0
    );

    console.log("RecoveredThisMonth =", total);

    return total;
}

export async function getRecoveredLastMonth(): Promise<number> {
    const today = new Date();

    const startOfLastMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        1
    );

    const sameDayLastMonth = new Date(
        today.getFullYear(),
        today.getMonth() - 1,
        today.getDate()
    );

    const startDate = toLocalDateString(
        startOfLastMonth
    );

    const endDate = toLocalDateString(
        sameDayLastMonth
    );

    const { data, error } = await supabase
        .from("payments")
        .select("amount")
        .gte("payment_date", startDate)
        .lte("payment_date", endDate);

    if (error) {
        throw error;
    }

    return data.reduce(
        (sum, payment) =>
            sum + Number(payment.amount),
        0
    );
}