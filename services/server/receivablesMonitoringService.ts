import { supabase } from "@/lib/supabase";
import { toLocalDateString } from "@/lib/date";
import { isInvoiceOverdue } from "@/lib/invoiceOverdue";
import { logInvoiceActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";
import { logEmployeeActivity } from "../EmployeeActivityService";

// ---------------------------------------------------------------------
// Types — string unions mirror the DB CHECK constraints in
// supabase/migrations/20260816120000_add_customer_receivables_assessments.sql
// exactly, so a value that type-checks here is guaranteed insertable.
// ---------------------------------------------------------------------

export type Severity = "none" | "low" | "elevated";

export type Deviation =
    | "not_applicable"
    | "unknown"
    | "within_pattern"
    | "moderate"
    | "severe";

export type Assessment =
    | "no_immediate_attention"
    | "monitor"
    | "needs_attention"
    | "critical";

export type Priority = "low" | "medium" | "high" | "critical";

// Relative multipliers for the deviation bucket — tunable v1 constants,
// approved alongside the decision matrix. Not monetary thresholds.
const DEVIATION_MODERATE_RATIO = 1;
const DEVIATION_SEVERE_RATIO = 2;

// Overdue amount as a share of total outstanding — approved 50% split
// between "low" and "elevated" severity. A ratio, not a ₹ figure.
const ELEVATED_OVERDUE_SHARE = 0.5;

const DEFAULT_PAYMENT_TERMS_DAYS = 30;

export interface ReceivablesEvidence {
    outstandingAmount: number;
    overdueAmount: number;
    overdueInvoiceCount: number;
    overdueSharePct: number | null;
    maxDaysOverdue: number;
    baselineDelayDays: number | null;
    deviationRatio: number | null;
    riskLevel: string;
    paymentConsistencyScore: number | null;
    termsBreach: boolean;
    severity: Severity;
    deviation: Deviation;
    currency: string;
}

export interface ReceivablesAssessmentResult {
    assessment: Assessment;
    priority: Priority;
    matrixRow: number;
    reason: string;
    evidence: ReceivablesEvidence;
}

// ---------------------------------------------------------------------
// Severity / Deviation — pure, from already-fetched signals only.
// ---------------------------------------------------------------------

function computeSeverity(
    overdueInvoiceCount: number,
    overdueShare: number
): Severity {
    if (overdueInvoiceCount === 0) return "none";

    if (
        overdueInvoiceCount > 1 ||
        overdueShare >= ELEVATED_OVERDUE_SHARE
    ) {
        return "elevated";
    }

    return "low";
}

// hasBaseline = false (insufficient_history/limited_history) always
// yields "unknown" — deviation can only be "severe" when there is a
// real paid-invoice history to deviate from, which is what makes
// Critical structurally unreachable for those customers (see
// computeReceivablesAssessment below: the only path to "critical" is
// severity="elevated" AND deviation="severe").
function computeDeviation(
    hasBaseline: boolean,
    maxDaysOverdue: number,
    baselineDelayDays: number
): Deviation {
    if (!hasBaseline) return "unknown";

    // Customer has never historically run late (average_late_payment_days
    // is 0 across all their paid invoices) — any current overdue days is
    // a full deviation from that baseline.
    if (baselineDelayDays <= 0) return "severe";

    const ratio = maxDaysOverdue / baselineDelayDays;

    if (ratio <= DEVIATION_MODERATE_RATIO) return "within_pattern";
    if (ratio <= DEVIATION_SEVERE_RATIO) return "moderate";
    return "severe";
}

// ---------------------------------------------------------------------
// The approved deterministic decision matrix (14 rows). Pure function —
// no I/O, no randomness, same inputs always produce the same output.
// Row numbers in comments match the matrix approved for Responsibility #2.
// ---------------------------------------------------------------------

export interface ReceivablesAssessmentInput {
    hasOutstanding: boolean;
    severity: Severity;
    hasBaseline: boolean;
    deviation: Deviation;
    riskLevel: string;
    termsBreach: boolean;

    outstandingAmount: number;
    overdueAmount: number;
    overdueInvoiceCount: number;
    maxDaysOverdue: number;
    baselineDelayDays: number | null;
    paymentConsistencyScore: number | null;
    currency: string;
}

function formatCurrency(amount: number, currency: string): string {
    const locale = currency === "INR" ? "en-IN" : "en-US";

    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(amount);
}

function buildEvidence(
    input: ReceivablesAssessmentInput
): ReceivablesEvidence {
    const overdueSharePct =
        input.outstandingAmount > 0
            ? Math.round(
                  (input.overdueAmount / input.outstandingAmount) * 100
              )
            : null;

    const deviationRatio =
        input.hasBaseline &&
        input.baselineDelayDays !== null &&
        input.baselineDelayDays > 0
            ? Math.round(
                  (input.maxDaysOverdue / input.baselineDelayDays) * 100
              ) / 100
            : null;

    return {
        outstandingAmount: input.outstandingAmount,
        overdueAmount: input.overdueAmount,
        overdueInvoiceCount: input.overdueInvoiceCount,
        overdueSharePct,
        maxDaysOverdue: input.maxDaysOverdue,
        baselineDelayDays: input.hasBaseline
            ? input.baselineDelayDays
            : null,
        deviationRatio,
        riskLevel: input.riskLevel,
        paymentConsistencyScore: input.paymentConsistencyScore,
        termsBreach: input.termsBreach,
        severity: input.severity,
        deviation: input.deviation,
        currency: input.currency,
    };
}

function buildReason(
    assessment: Assessment,
    matrixRow: number,
    input: ReceivablesAssessmentInput,
    evidence: ReceivablesEvidence
): string {
    const money = (amount: number) => formatCurrency(amount, input.currency);

    switch (matrixRow) {
        case 1:
            return "No outstanding balance.";

        case 2:
            return `${money(input.outstandingAmount)} outstanding, no invoices overdue. Risk level: ${input.riskLevel}.`;

        case 3:
            return `${money(input.outstandingAmount)} outstanding, not yet due. Risk level is ${input.riskLevel}, so this account is being watched proactively.`;

        case 4:
            return `${money(input.overdueAmount)} overdue on 1 invoice, ${input.maxDaysOverdue} days overdue — within this customer's normal ~${input.baselineDelayDays} day pattern.`;

        case 13:
            return `${money(input.overdueAmount)} overdue on 1 invoice, ${input.maxDaysOverdue} days overdue. No payment history yet to compare against a normal pattern.`;

        case 5:
        case 6:
        case 7:
        case 8:
        case 9:
        case 10: {
            const exposure = `${money(input.overdueAmount)} overdue across ${input.overdueInvoiceCount} invoice${input.overdueInvoiceCount === 1 ? "" : "s"} (${evidence.overdueSharePct ?? 0}% of outstanding), up to ${input.maxDaysOverdue} days overdue.`;

            let deviationClause: string;

            if (input.deviation === "within_pattern") {
                deviationClause = `This is within the customer's normal ~${input.baselineDelayDays} day pattern, but the number/share of overdue invoices is itself notable.`;
            } else {
                const ratio = evidence.deviationRatio;
                deviationClause =
                    ratio !== null
                        ? `The customer normally pays within about ${input.baselineDelayDays} days when late; the current delay is roughly ${ratio}x that.`
                        : `This customer has no history of being late before now, so the current delay is a clear break from their normal behavior.`;
            }

            const riskClause = `Risk level: ${input.riskLevel}.`;

            return `${exposure} ${deviationClause} ${riskClause}`;
        }

        case 14: {
            const exposure = `${money(input.overdueAmount)} overdue across ${input.overdueInvoiceCount} invoice${input.overdueInvoiceCount === 1 ? "" : "s"} (${evidence.overdueSharePct ?? 0}% of outstanding), up to ${input.maxDaysOverdue} days overdue.`;
            const historyClause = "No payment history exists yet to establish a normal pattern.";
            const breachClause = input.termsBreach
                ? " At least one invoice has now exceeded its own payment terms."
                : "";

            return `${exposure} ${historyClause}${breachClause}`;
        }

        case 12: {
            const ratio = evidence.deviationRatio;

            const deviationText =
                ratio !== null
                    ? `${ratio}x this customer's normal ~${input.baselineDelayDays} day pattern`
                    : `far beyond this customer's history — they have no record of being late before now`;

            return `${money(input.overdueAmount)} overdue across ${input.overdueInvoiceCount} invoice${input.overdueInvoiceCount === 1 ? "" : "s"} (${evidence.overdueSharePct ?? 0}% of outstanding), up to ${input.maxDaysOverdue} days overdue — ${deviationText}. Risk level: ${input.riskLevel}.`;
        }

        default:
            return `${assessment.replace(/_/g, " ")} — ${money(input.overdueAmount)} overdue.`;
    }
}

// Evaluated as a partition (mirrors the approved matrix exactly), not a
// top-down cascade — each branch is mutually exclusive, so there is no
// rule-ordering to reason about. Row numbers in comments are the exact
// approved matrix rows this branch implements.
export function computeReceivablesAssessment(
    input: ReceivablesAssessmentInput
): ReceivablesAssessmentResult {
    const evidence = buildEvidence(input);
    const riskHigh = input.riskLevel === "high";

    let assessment: Assessment;
    let priority: Priority;
    let matrixRow: number;

    if (!input.hasOutstanding) {
        // Row 1
        assessment = "no_immediate_attention";
        priority = "low";
        matrixRow = 1;
    } else if (input.severity === "none") {
        if (input.riskLevel === "moderate" || riskHigh) {
            // Row 3
            assessment = "monitor";
            priority = "low";
            matrixRow = 3;
        } else {
            // Row 2
            assessment = "no_immediate_attention";
            priority = "low";
            matrixRow = 2;
        }
    } else if (!input.hasBaseline) {
        // deviation === "unknown" — insufficient_history/limited_history.
        // Structurally cannot reach "critical" from this branch.
        if (input.severity === "low") {
            // Row 13
            assessment = "monitor";
            priority = "medium";
            matrixRow = 13;
        } else {
            // Row 14 — the only place termsBreach changes an outcome.
            assessment = "needs_attention";
            priority = input.termsBreach ? "high" : "medium";
            matrixRow = 14;
        }
    } else if (input.severity === "low") {
        if (input.deviation === "within_pattern") {
            // Row 4
            assessment = "monitor";
            priority = "medium";
            matrixRow = 4;
        } else if (input.deviation === "moderate") {
            // Rows 5/6 — termsBreach only matters when not already High.
            assessment = "needs_attention";
            priority = riskHigh
                ? "high"
                : input.termsBreach
                  ? "high"
                  : "medium";
            matrixRow = riskHigh ? 6 : 5;
        } else {
            // Row 7 — deviation "severe", already High regardless of termsBreach.
            assessment = "needs_attention";
            priority = "high";
            matrixRow = 7;
        }
    } else {
        // severity === "elevated"
        if (input.deviation === "within_pattern") {
            // Rows 8/9
            assessment = "needs_attention";
            priority = riskHigh
                ? "high"
                : input.termsBreach
                  ? "high"
                  : "medium";
            matrixRow = riskHigh ? 9 : 8;
        } else if (input.deviation === "moderate") {
            // Rows 10/11
            assessment = "needs_attention";
            priority = riskHigh
                ? "high"
                : input.termsBreach
                  ? "high"
                  : "medium";
            matrixRow = riskHigh ? 11 : 10;
        } else {
            // Row 12 — the ONLY path to Critical: elevated severity + severe
            // deviation. deviation="severe" requires hasBaseline=true, so
            // insufficient_history/limited_history customers can never
            // land here.
            assessment = "critical";
            priority = "critical";
            matrixRow = 12;
        }
    }

    const reason = buildReason(assessment, matrixRow, input, evidence);

    return { assessment, priority, matrixRow, reason, evidence };
}

// ---------------------------------------------------------------------
// Data access — small, purpose-specific queries. Does NOT recompute
// Customer Intelligence: risk_level / average_late_payment_days /
// payment_consistency_score are read from the existing customer_insights
// row (services/server/customerInsightService.ts remains the sole owner
// of that calculation). Only outstanding/overdue amounts and per-invoice
// day-age are computed here, freshly, from public.invoices — a much
// smaller and structurally different computation (plain aggregation +
// the existing isInvoiceOverdue() predicate) than the payment-behavior/
// risk/confidence engine in customerInsightService.ts.
// ---------------------------------------------------------------------

interface InvoiceRow {
    due_date: string;
    balance_due: number | string;
    status: string;
    payment_terms: number | null;
    currency: string;
}

export interface OverdueInvoiceDetail {
    outstandingAmount: number;
    overdueAmount: number;
    overdueInvoiceCount: number;
    maxDaysOverdue: number;
    termsBreach: boolean;
    currency: string;
}

export async function getOverdueInvoiceDetail(
    customerId: string
): Promise<OverdueInvoiceDetail> {
    const { data, error } = await supabase
        .from("invoices")
        .select("due_date, balance_due, status, payment_terms, currency")
        .eq("customer_id", customerId);

    if (error) throw error;

    const invoices = (data ?? []) as InvoiceRow[];
    const today = toLocalDateString(new Date());

    let outstandingAmount = 0;
    let overdueAmount = 0;
    let overdueInvoiceCount = 0;
    let maxDaysOverdue = 0;
    let maxDaysOverdueInvoiceTerms: number | null = null;

    for (const invoice of invoices) {
        const balanceDue = Math.max(Number(invoice.balance_due), 0);
        outstandingAmount += balanceDue;

        if (!isInvoiceOverdue(invoice, today)) continue;

        overdueInvoiceCount += 1;
        overdueAmount += balanceDue;

        const daysOverdue = Math.floor(
            (new Date(today).getTime() -
                new Date(invoice.due_date).getTime()) /
                (1000 * 60 * 60 * 24)
        );

        if (daysOverdue > maxDaysOverdue) {
            maxDaysOverdue = daysOverdue;
            maxDaysOverdueInvoiceTerms =
                invoice.payment_terms ?? DEFAULT_PAYMENT_TERMS_DAYS;
        }
    }

    const termsBreach =
        maxDaysOverdueInvoiceTerms !== null &&
        maxDaysOverdue > maxDaysOverdueInvoiceTerms;

    return {
        outstandingAmount: Math.round(outstandingAmount * 100) / 100,
        overdueAmount: Math.round(overdueAmount * 100) / 100,
        overdueInvoiceCount,
        maxDaysOverdue,
        termsBreach,
        currency: invoices[0]?.currency ?? "INR",
    };
}

interface CustomerInsightSignals {
    risk_level: string;
    average_late_payment_days: number | null;
    payment_consistency_score: number | null;
}

const HAS_BASELINE_RISK_LEVELS = new Set(["low", "moderate", "high"]);

export async function upsertReceivablesAssessment(
    customerId: string,
    result: ReceivablesAssessmentResult
) {
    const { data, error } = await supabase
        .from("customer_receivables_assessments")
        .upsert(
            {
                customer_id: customerId,

                assessment: result.assessment,
                priority: result.priority,

                severity: result.evidence.severity,
                deviation: result.evidence.deviation,
                terms_breach: result.evidence.termsBreach,

                matrix_row: result.matrixRow,

                reason: result.reason,
                evidence: result.evidence,

                assessed_at: new Date().toISOString(),
            },
            { onConflict: "customer_id" }
        )
        .select()
        .single();

    if (error) throw error;

    return data;
}

const ASSESSMENT_LABELS: Record<Assessment, string> = {
    no_immediate_attention: "No Immediate Attention",
    monitor: "Monitor",
    needs_attention: "Needs Attention",
    critical: "Critical",
};

const PRIORITY_LABELS: Record<Priority, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
};

// Reads the existing customer_insights row (Responsibility #1's output,
// never recomputed here), runs the small new overdue-detail query, applies
// the approved decision matrix, persists the result, and logs it through
// the existing activity infrastructure — same shape as
// customerInsightService.ts::refreshCustomerInsights().
//
// If customer_insights doesn't exist yet for this customer, this is a
// no-op (not an error): Responsibility #2 depends on Responsibility #1
// having run first, and will pick this customer up once it has (via the
// next background trigger or backfill pass).
export async function refreshReceivablesAssessment(
    customerId: string,
    uploadSessionId?: string
) {
    const { data: insight, error: insightError } = await supabase
        .from("customer_insights")
        .select(
            "risk_level, average_late_payment_days, payment_consistency_score"
        )
        .eq("customer_id", customerId)
        .maybeSingle();

    if (insightError) throw insightError;

    if (!insight) {
        console.log(
            `⏭️ Receivables assessment skipped — no customer_insights yet for ${customerId}`
        );
        return null;
    }

    const signals = insight as CustomerInsightSignals;

    const overdueDetail = await getOverdueInvoiceDetail(customerId);

    const hasBaseline = HAS_BASELINE_RISK_LEVELS.has(signals.risk_level);
    const hasOutstanding = overdueDetail.outstandingAmount > 0;

    const overdueShare =
        overdueDetail.outstandingAmount > 0
            ? overdueDetail.overdueAmount / overdueDetail.outstandingAmount
            : 0;

    const severity = computeSeverity(
        overdueDetail.overdueInvoiceCount,
        overdueShare
    );

    const baselineDelayDays = signals.average_late_payment_days ?? 0;

    const deviation: Deviation =
        severity === "none"
            ? "not_applicable"
            : computeDeviation(
                  hasBaseline,
                  overdueDetail.maxDaysOverdue,
                  baselineDelayDays
              );

    const result = computeReceivablesAssessment({
        hasOutstanding,
        severity,
        hasBaseline,
        deviation,
        riskLevel: signals.risk_level,
        termsBreach: overdueDetail.termsBreach,

        outstandingAmount: overdueDetail.outstandingAmount,
        overdueAmount: overdueDetail.overdueAmount,
        overdueInvoiceCount: overdueDetail.overdueInvoiceCount,
        maxDaysOverdue: overdueDetail.maxDaysOverdue,
        baselineDelayDays: hasBaseline ? baselineDelayDays : null,
        paymentConsistencyScore: signals.payment_consistency_score,
        currency: overdueDetail.currency,
    });

    const saved = await upsertReceivablesAssessment(customerId, result);

    await logInvoiceActivity(
        null,
        customerId,
        ActivityTypes.RECEIVABLES_ASSESSMENT_UPDATED,
        result.reason,
        {
            assessment: result.assessment,
            priority: result.priority,
            matrixRow: result.matrixRow,
            ...result.evidence,
        }
    );

    await logEmployeeActivity({
        uploadSessionId,
        activityType: "receivables_assessment_updated",
        message: `Receivables reviewed · ${ASSESSMENT_LABELS[result.assessment]} · ${PRIORITY_LABELS[result.priority]} priority`,
    });

    console.log("📊 Receivables Assessment Updated");
    console.log("Customer:", customerId);
    console.log("Assessment:", result.assessment, "| Priority:", result.priority);

    return saved;
}

interface CustomerMissingAssessmentRow {
    id: string;
    company_name: string;
    customer_insights: { id: string }[] | null;
    customer_receivables_assessments: { id: string }[] | null;
}

export interface CustomerMissingAssessment {
    id: string;
    companyName: string;
}

// Customers that already have Customer Intelligence (customer_insights
// exists — Responsibility #1 has run) but no receivables assessment yet.
// Mirrors customerInsightService.ts::getCustomersMissingInsights()'s
// fetch-relation-and-filter-client-side approach for the same reason
// (PostgREST has no direct anti-join).
export async function getCustomersMissingAssessment(
    limit = 25
): Promise<CustomerMissingAssessment[]> {
    const { data, error } = await supabase
        .from("customers")
        .select(
            `
            id,
            company_name,
            customer_insights!inner (
                id
            ),
            customer_receivables_assessments (
                id
            )
        `
        );

    if (error) throw error;

    const rows = (data ?? []) as unknown as CustomerMissingAssessmentRow[];

    return rows
        .filter(
            (row) =>
                !row.customer_receivables_assessments ||
                row.customer_receivables_assessments.length === 0
        )
        .slice(0, limit)
        .map((row) => ({
            id: row.id,
            companyName: row.company_name,
        }));
}
