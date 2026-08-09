import { supabase } from "@/lib/supabase";
import {
    generateCustomerInsightSummary,
} from "./customerInsightAIService";
import { logInvoiceActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";
import { logEmployeeActivity } from "../EmployeeActivityService";
import { toLocalDateString } from "@/lib/date";
import { isInvoiceOverdue } from "@/lib/invoiceOverdue";
interface InvoiceRecord {
    id: string;
    invoice_amount: number | string;
    balance_due: number | string;
    due_date: string;
    status: string;
    currency: string;
}

interface PaymentRecord {
    invoice_id: string;
    amount: number | string;
    payment_date: string;
}

interface PaymentBehavior {
    invoiceId: string;
    paymentDate: string;
    dueDate: string;
    delayDays: number;
}

export interface CustomerInsightResult {
    totalInvoices: number;
    paidInvoiceCount: number;
    openInvoiceCount: number;

    totalInvoicedAmount: number;
    totalCollectedAmount: number;
    currentOutstandingAmount: number;
    overdueAmount: number;
    overdueInvoiceCount: number;

    onTimePaymentRate: number | null;
    earlyPaymentRate: number | null;
    latePaymentRate: number | null;

    averageDelayDays: number | null;
    averageLatePaymentDays: number | null;
    largestDelayDays: number | null;
    lastPaymentDelayDays: number | null;

    paymentConsistencyScore: number | null;
    paymentConfidence: number | null;
    riskLevel: string;

    predictedPaymentDays: number | null;
    lastPaymentDate: string | null;
    paymentCount: number;
    partialPaymentInvoiceCount: number;
    averagePaymentsPerInvoice: number;
}

function round(value: number, decimals = 2) {
    const multiplier = Math.pow(10, decimals);

    return (
        Math.round(value * multiplier) /
        multiplier
    );
}

function getRiskLevel(
    confidence: number | null
): string {
    if (confidence === null) {
        return "insufficient_history";
    }

    if (confidence >= 80) {
        return "low";
    }

    if (confidence >= 60) {
        return "moderate";
    }

    return "high";
}

function calculateConsistencyScore(
    delays: number[]
): number | null {

    if (delays.length === 0) {
        return null;
    }

    /*
     * Consistency measures how tightly payment
     * behavior clusters around the customer's
     * normal payment pattern.
     *
     * Lower variation = higher consistency.
     */

    const mean =
        delays.reduce(
            (sum, value) =>
                sum + value,
            0
        ) / delays.length;

    const variance =
        delays.reduce(
            (sum, value) =>
                sum +
                Math.pow(
                    value - mean,
                    2
                ),
            0
        ) / delays.length;

    const standardDeviation =
        Math.sqrt(variance);

    /*
     * 0 days variation = 100
     * 30+ days variation = 0
     */

    const score =
        100 -
        (Math.min(
            standardDeviation,
            30
        ) /
            30) *
            100;

    return Math.round(
        Math.max(
            0,
            Math.min(100, score)
        )
    );
}

function calculatePaymentConfidence({
    onTimeRate,
    averageLateDays,
    consistencyScore,
    historyCount,
}: {
    onTimeRate: number;
    averageLateDays: number;
    consistencyScore: number;
    historyCount: number;
}): number {

    /*
     * ---------------------------------------------
     * 1. PAYMENT CONSISTENCY — 35%
     * ---------------------------------------------
     *
     * Higher consistency = lower collection risk.
     */
    const consistencyScoreWeighted =
        consistencyScore * 0.35;


    /*
     * ---------------------------------------------
     * 2. LATE PAYMENT SEVERITY — 35%
     * ---------------------------------------------
     *
     * We care about HOW late the customer is,
     * not merely whether they were late.
     */

    let delaySeverityScore: number;

    if (averageLateDays <= 2) {
        delaySeverityScore = 100;
    } else if (averageLateDays <= 5) {
        delaySeverityScore = 90;
    } else if (averageLateDays <= 10) {
        delaySeverityScore = 75;
    } else if (averageLateDays <= 20) {
        delaySeverityScore = 50;
    } else if (averageLateDays <= 30) {
        delaySeverityScore = 25;
    } else {
        delaySeverityScore = 0;
    }

    const delaySeverityWeighted =
        delaySeverityScore * 0.35;


    /*
     * ---------------------------------------------
     * 3. ON-TIME BEHAVIOR — 20%
     * ---------------------------------------------
     */

    const onTimeScoreWeighted =
        onTimeRate * 0.20;


    /*
     * ---------------------------------------------
     * 4. HISTORY DEPTH — 10%
     * ---------------------------------------------
     *
     * More completed payment history means
     * greater confidence in the assessment.
     *
     * 1 payment  = 60
     * 5 payments = 80
     * 10+        = 100
     */

    let historyScore: number;

    if (historyCount <= 1) {
        historyScore = 60;
    } else if (historyCount <= 5) {
        historyScore =
            60 +
            ((historyCount - 1) / 4) *
                20;
    } else {
        historyScore =
            80 +
            Math.min(
                ((historyCount - 5) / 5) *
                    20,
                20
            );
    }

    const historyWeighted =
        historyScore * 0.10;


    /*
     * ---------------------------------------------
     * FINAL CONFIDENCE
     * ---------------------------------------------
     */

    const score =
        consistencyScoreWeighted +
        delaySeverityWeighted +
        onTimeScoreWeighted +
        historyWeighted;

    return Math.round(
        Math.max(
            0,
            Math.min(
                100,
                score
            )
        )
    );
}

export async function calculateCustomerInsights(
    customerId: string
): Promise<CustomerInsightResult> {

    /*
     * --------------------------------------------------
     * 1. GET CUSTOMER INVOICES
     * --------------------------------------------------
     */

    const {
        data: invoices,
        error: invoiceError,
    } = await supabase
        .from("invoices")
        .select(`
            id,
            invoice_amount,
            balance_due,
            due_date,
            status,
            currency
        `)
        .eq(
            "customer_id",
            customerId
        );

    if (invoiceError) {
        throw invoiceError;
    }

    /*
     * --------------------------------------------------
     * 2. GET CUSTOMER PAYMENTS
     * --------------------------------------------------
     */

    const {
        data: payments,
        error: paymentError,
    } = await supabase
        .from("payments")
        .select(`
            invoice_id,
            amount,
            payment_date
        `)
        .eq(
            "customer_id",
            customerId
        );

    if (paymentError) {
        throw paymentError;
    }

    const invoiceRecords =
        (invoices ??
            []) as InvoiceRecord[];

    const paymentRecords =
        (payments ??
            []) as PaymentRecord[];
    
    const paymentCount =
    paymentRecords.length;

    /*
     * --------------------------------------------------
     * 3. BASIC RELATIONSHIP METRICS
     * --------------------------------------------------
     */

    const totalInvoices =
        invoiceRecords.length;

    const totalInvoicedAmount =
        invoiceRecords.reduce(
            (sum, invoice) =>
                sum +
                Number(
                    invoice.invoice_amount
                ),
            0
        );

    const currentOutstandingAmount =
        invoiceRecords.reduce(
            (sum, invoice) =>
                sum +
                Math.max(
                    Number(
                        invoice.balance_due
                    ),
                    0
                ),
            0
        );

    const openInvoiceCount =
        invoiceRecords.filter(
            (invoice) =>
                Number(
                    invoice.balance_due
                ) > 0
        ).length;

    const today = toLocalDateString(new Date());

    const overdueInvoices =
        invoiceRecords.filter((invoice) =>
            isInvoiceOverdue(invoice, today)
        );

    const overdueAmount =
        overdueInvoices.reduce(
            (sum, invoice) =>
                sum +
                Math.max(
                    Number(
                        invoice.balance_due
                    ),
                    0
                ),
            0
        );

    const overdueInvoiceCount =
        overdueInvoices.length;

    /*
     * --------------------------------------------------
     * 4. TOTAL COLLECTED
     * --------------------------------------------------
     */

    const totalCollectedAmount =
        paymentRecords.reduce(
            (sum, payment) =>
                sum +
                Number(payment.amount),
            0
        );

    /*
     * --------------------------------------------------
     * 5. BUILD PAYMENT MAP
     * --------------------------------------------------
     */

const paymentsByInvoice =
    new Map<
        string,
        PaymentRecord[]
    >();

for (const payment of paymentRecords) {

    const existing =
        paymentsByInvoice.get(
            payment.invoice_id
        ) ?? [];

    existing.push(payment);

    paymentsByInvoice.set(
        payment.invoice_id,
        existing
    );
}

/*
 * --------------------------------------------------
 * PAYMENT BEHAVIOR / PAYMENT FRAGMENTATION
 * --------------------------------------------------
 */

const partialPaymentInvoiceCount =
    invoiceRecords.filter((invoice) => {

        const invoicePayments =
            paymentsByInvoice.get(
                invoice.id
            ) ?? [];

        if (
            invoicePayments.length === 0
        ) {
            return false;
        }

        const totalPaid =
            invoicePayments.reduce(
                (sum, payment) =>
                    sum +
                    Number(payment.amount),
                0
            );

        const invoiceAmount =
            Number(
                invoice.invoice_amount
            );

        return (
            totalPaid > 0 &&
            totalPaid < invoiceAmount
        );

    }).length;

const invoicesWithPaymentActivity =
    invoiceRecords.filter((invoice) =>
        (
            paymentsByInvoice.get(
                invoice.id
            ) ?? []
        ).length > 0
    ).length;

const averagePaymentsPerInvoice =
    invoicesWithPaymentActivity > 0
        ? paymentCount /
          invoicesWithPaymentActivity
        : 0;

console.log(
    "📊 PAYMENT BEHAVIOR DEBUG"
);

console.log({
    paymentCount,
    invoicesWithPaymentActivity,
    partialPaymentInvoiceCount,
    averagePaymentsPerInvoice,
});
    for (const payment of paymentRecords) {

        const existing =
            paymentsByInvoice.get(
                payment.invoice_id
            ) ?? [];

        existing.push(payment);

        paymentsByInvoice.set(
            payment.invoice_id,
            existing
        );
    }

    /*
     * --------------------------------------------------
     * 6. DETERMINE FULLY PAID INVOICES
     *
     * We only use an invoice for payment-behavior
     * analysis once cumulative payments cover
     * the invoice amount.
     * --------------------------------------------------
     */

    const paymentBehaviors: PaymentBehavior[] =
        [];

    for (const invoice of invoiceRecords) {

        const invoicePayments =
            paymentsByInvoice.get(
                invoice.id
            ) ?? [];

        if (
            invoicePayments.length === 0
        ) {
            continue;
        }

        const totalPaid =
            invoicePayments.reduce(
                (sum, payment) =>
                    sum +
                    Number(payment.amount),
                0
            );

        const invoiceAmount =
            Number(
                invoice.invoice_amount
            );

        /*
         * Not fully paid yet.
         */
        if (
            totalPaid <
            invoiceAmount
        ) {
            continue;
        }

        /*
         * The invoice becomes fully paid on
         * the date of the payment that crosses
         * the invoice amount.
         */

        const sortedPayments = [
            ...invoicePayments,
        ].sort(
            (a, b) =>
                new Date(
                    a.payment_date
                ).getTime() -
                new Date(
                    b.payment_date
                ).getTime()
        );

        let cumulativePaid = 0;

        let finalPayment:
            | PaymentRecord
            | null = null;

        for (
            const payment of
                sortedPayments
        ) {

            cumulativePaid +=
                Number(payment.amount);

            if (
                cumulativePaid >=
                invoiceAmount
            ) {
                finalPayment =
                    payment;

                break;
            }
        }

        if (!finalPayment) {
            continue;
        }

        const dueDate =
            new Date(
                invoice.due_date
            );

        const paymentDate =
            new Date(
                finalPayment.payment_date
            );

        const delayDays =
            Math.round(
                (
                    paymentDate.getTime() -
                    dueDate.getTime()
                ) /
                    (
                        1000 *
                        60 *
                        60 *
                        24
                    )
            );

        paymentBehaviors.push({
            invoiceId:
                invoice.id,

            paymentDate:
                finalPayment.payment_date,

            dueDate:
                invoice.due_date,

            delayDays,
        });
    }

    /*
     * --------------------------------------------------
     * 7. PAID INVOICE COUNT
     * --------------------------------------------------
     */

    const paidInvoiceCount =
        paymentBehaviors.length;

    /*
     * --------------------------------------------------
     * 8. NO PAYMENT HISTORY
     * --------------------------------------------------
     */

    if (paymentCount === 0) {
    return {
        totalInvoices,

        paidInvoiceCount: 0,

        openInvoiceCount,
        
         paymentCount,
    partialPaymentInvoiceCount,
    averagePaymentsPerInvoice,


        totalInvoicedAmount:
            round(
                totalInvoicedAmount
            ),

        totalCollectedAmount:
            round(
                totalCollectedAmount
            ),

        currentOutstandingAmount:
            round(
                currentOutstandingAmount
            ),

        overdueAmount:
            round(overdueAmount),

        overdueInvoiceCount,

        // No payment history yet
        onTimePaymentRate: 0,

        earlyPaymentRate: null,

        latePaymentRate: null,

        averageDelayDays: 0,

        averageLatePaymentDays:
            null,

        largestDelayDays: null,

        lastPaymentDelayDays:
            null,

        paymentConsistencyScore:
            null,

        // 0 = no payment history,
        // NOT "bad payer"
        paymentConfidence: 0,

        riskLevel:
            "insufficient_history",

        predictedPaymentDays:
            null,

        lastPaymentDate: null,
    };

    
}
if (
    paymentCount > 0 &&
    paidInvoiceCount === 0
) {
    return {
        totalInvoices,

        paidInvoiceCount: 0,

        openInvoiceCount,

        paymentCount,
        partialPaymentInvoiceCount,
        averagePaymentsPerInvoice,

        totalInvoicedAmount:
            round(totalInvoicedAmount),

        totalCollectedAmount:
            round(totalCollectedAmount),

        currentOutstandingAmount:
            round(currentOutstandingAmount),

        overdueAmount:
            round(overdueAmount),

        overdueInvoiceCount,

        onTimePaymentRate: 0,

        earlyPaymentRate: null,

        latePaymentRate: null,

        averageDelayDays: 0,

        averageLatePaymentDays: null,

        largestDelayDays: null,

        lastPaymentDelayDays: null,

        paymentConsistencyScore: null,

        paymentConfidence: 25,

        riskLevel: "limited_history",

        predictedPaymentDays: null,

        lastPaymentDate: null,
    };
}
    /*
     * --------------------------------------------------
     * 9. PAYMENT BEHAVIOR METRICS
     * --------------------------------------------------
     */

    const delays =
        paymentBehaviors.map(
            (payment) =>
                payment.delayDays
        );

    const onTimePayments =
    delays.filter(
        (delay) =>
            delay <= 0
    ).length;

    const earlyPayments =
        delays.filter(
            (delay) =>
                delay < 0
        ).length;

    const latePayments =
        delays.filter(
            (delay) =>
                delay > 0
        ).length;

    const onTimePaymentRate =
        (onTimePayments /
            paidInvoiceCount) *
        100;

    const earlyPaymentRate =
        (earlyPayments /
            paidInvoiceCount) *
        100;

    const latePaymentRate =
        (latePayments /
            paidInvoiceCount) *
        100;

    /*
     * --------------------------------------------------
     * 10. AVERAGE DELAY
     * --------------------------------------------------
     */

    const averageDelayDays =
        delays.reduce(
            (sum, delay) =>
                sum + delay,
            0
        ) /
        paidInvoiceCount;

    /*
     * --------------------------------------------------
     * 11. AVERAGE LATE PAYMENT
     * --------------------------------------------------
     */

    const lateDelays =
        delays.filter(
            (delay) =>
                delay > 0
        );

    const averageLatePaymentDays =
        lateDelays.length > 0
            ? lateDelays.reduce(
                  (sum, delay) =>
                      sum + delay,
                  0
              ) /
              lateDelays.length
            : 0;

    /*
     * --------------------------------------------------
     * 12. LARGEST DELAY
     * --------------------------------------------------
     */

    const largestDelayDays =
        Math.max(...delays);

    /*
     * --------------------------------------------------
     * 13. MOST RECENT PAYMENT BEHAVIOR
     * --------------------------------------------------
     */

    const sortedBehaviors = [
        ...paymentBehaviors,
    ].sort(
        (a, b) =>
            new Date(
                b.paymentDate
            ).getTime() -
            new Date(
                a.paymentDate
            ).getTime()
    );

    const lastPayment =
        sortedBehaviors[0];

    const lastPaymentDate =
        lastPayment.paymentDate;

    const lastPaymentDelayDays =
        lastPayment.delayDays;

    /*
     * --------------------------------------------------
     * 14. PAYMENT CONSISTENCY
     * --------------------------------------------------
     */

    const paymentConsistencyScore =
        calculateConsistencyScore(
            delays
        );

    /*
     * --------------------------------------------------
     * 15. PAYMENT CONFIDENCE
     * --------------------------------------------------
     */

    const paymentConfidence =
        calculatePaymentConfidence({
            onTimeRate:
                onTimePaymentRate,

            averageLateDays:
                averageLatePaymentDays,

            consistencyScore:
                paymentConsistencyScore ??
                0,

            historyCount:
                paidInvoiceCount,
        });

    /*
     * --------------------------------------------------
     * 16. RISK
     * --------------------------------------------------
     */

    const riskLevel =
        getRiskLevel(
            paymentConfidence
        );

    /*
     * --------------------------------------------------
     * 17. PREDICTED PAYMENT DAYS
     *
     * Simple MVP prediction:
     * historical average payment delay.
     * --------------------------------------------------
     */

    const predictedPaymentDays =
        Math.round(
            averageDelayDays
        );

    /*
     * --------------------------------------------------
     * 18. FINAL RESULT
     * --------------------------------------------------
     */

    return {
        totalInvoices,

        paidInvoiceCount,

        openInvoiceCount,

        paymentCount,
        partialPaymentInvoiceCount,
        averagePaymentsPerInvoice,

        totalInvoicedAmount:
            round(
                totalInvoicedAmount
            ),

        totalCollectedAmount:
            round(
                totalCollectedAmount
            ),

        currentOutstandingAmount:
            round(
                currentOutstandingAmount
            ),

        overdueAmount:
            round(overdueAmount),

        overdueInvoiceCount,

        onTimePaymentRate:
            round(
                onTimePaymentRate
            ),

        earlyPaymentRate:
            round(
                earlyPaymentRate
            ),

        latePaymentRate:
            round(
                latePaymentRate
            ),

        averageDelayDays:
            round(
                averageDelayDays
            ),

        averageLatePaymentDays:
            round(
                averageLatePaymentDays
            ),

        largestDelayDays,

        lastPaymentDelayDays,

        paymentConsistencyScore,

        paymentConfidence,

        riskLevel,

        predictedPaymentDays,

        lastPaymentDate,
    };
}

export async function testCustomerInsights(
    customerId: string
) {
    const insights =
        await calculateCustomerInsights(customerId);

    console.log("=================================");
    console.log("🧠 CUSTOMER INSIGHTS");
    console.log("=================================");

    console.log(
        "Customer ID:",
        customerId
    );

    console.table({
        "Total Invoices":
            insights.totalInvoices,

        "Paid Invoices":
            insights.paidInvoiceCount,

        "Open Invoices":
            insights.openInvoiceCount,

        "Total Invoiced":
            insights.totalInvoicedAmount,

        "Total Collected":
            insights.totalCollectedAmount,

        "Current Outstanding":
            insights.currentOutstandingAmount,

        "Overdue Amount":
            insights.overdueAmount,

        "Overdue Invoice Count":
            insights.overdueInvoiceCount,

        "On-Time Payment Rate":
            insights.onTimePaymentRate,

        "Early Payment Rate":
            insights.earlyPaymentRate,

        "Late Payment Rate":
            insights.latePaymentRate,

        "Average Delay Days":
            insights.averageDelayDays,

        "Average Late Payment Days":
            insights.averageLatePaymentDays,

        "Largest Delay Days":
            insights.largestDelayDays,

        "Last Payment Delay Days":
            insights.lastPaymentDelayDays,

        "Payment Consistency Score":
            insights.paymentConsistencyScore,

        "Payment Confidence":
            insights.paymentConfidence,

        "Risk Level":
            insights.riskLevel,

        "Predicted Payment Days":
            insights.predictedPaymentDays,

        "Last Payment Date":
            insights.lastPaymentDate,
    });

    console.log("=================================");

    return insights;
}

export async function upsertCustomerInsights(
    customerId: string,
    insights: CustomerInsightResult,
    aiSummary: string
) {
    const { data, error } =
        await supabase
            .from("customer_insights")
            .upsert(
                {
                    customer_id: customerId,

                    payment_confidence:
                        insights.paymentConfidence,

                    risk_level:
                        insights.riskLevel,

                    average_delay_days:
                        insights.averageDelayDays,

                    on_time_payment_rate:
                        insights.onTimePaymentRate,

                    predicted_payment_days:
                        insights.predictedPaymentDays,

                    ai_summary:
                        aiSummary,

                    last_analysed_at:
                        new Date().toISOString(),

                    total_invoices:
                        insights.totalInvoices,

                    paid_invoice_count:
                        insights.paidInvoiceCount,

                    open_invoice_count:
                        insights.openInvoiceCount,

                    total_invoiced_amount:
                        insights.totalInvoicedAmount,

                    total_collected_amount:
                        insights.totalCollectedAmount,

                    current_outstanding_amount:
                        insights.currentOutstandingAmount,

                    overdue_amount:
                        insights.overdueAmount,

                    overdue_invoice_count:
                        insights.overdueInvoiceCount,

                    early_payment_rate:
                        insights.earlyPaymentRate,

                    late_payment_rate:
                        insights.latePaymentRate,

                    average_late_payment_days:
                        insights.averageLatePaymentDays,

                    largest_delay_days:
                        insights.largestDelayDays,

                    last_payment_delay_days:
                        insights.lastPaymentDelayDays,

                    payment_consistency_score:
                        insights.paymentConsistencyScore,

                    last_payment_date:
                        insights.lastPaymentDate,

                    payment_count:
                        insights.paymentCount,

                    partial_payment_invoice_count:
                        insights.partialPaymentInvoiceCount,

                    average_payments_per_invoice:
                        insights.averagePaymentsPerInvoice,
                    
                },
                {
                    onConflict:
                        "customer_id",
                }
            )
            .select()
            .single();

    if (error) {
        throw error;
    }

    return data;
}

export interface LatestCustomerInsight {
    customerId: string;
    customerName: string;
    aiSummary: string;
    lastAnalysedAt: string;
}

interface CustomerInsightRow {
    customer_id: string;
    ai_summary: string | null;
    last_analysed_at: string;
    overdue_amount: number;
    customers: { company_name: string } | null;
}

// Selects the customer with the most meaningful current AR
// situation — highest real overdue exposure first, most recently
// analysed as a tiebreaker — rather than simply whichever customer
// was most recently touched by an upload or payment. Point-in-time
// only: no trend/comparison claim is made, since customer_insights
// only stores a current snapshot with no history to compare against.
export async function getMostUrgentCustomerInsight(): Promise<LatestCustomerInsight | null> {
    const { data, error } = await supabase
        .from("customer_insights")
        .select(
            `
            customer_id,
            ai_summary,
            last_analysed_at,
            overdue_amount,
            customers (
                company_name
            )
        `
        )
        .not("ai_summary", "is", null)
        .order("overdue_amount", { ascending: false })
        .order("last_analysed_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) {
        throw error;
    }

    const row = data as unknown as CustomerInsightRow | null;

    if (!row || !row.ai_summary) {
        return null;
    }

    return {
        customerId: row.customer_id,
        customerName: row.customers?.company_name ?? "A customer",
        aiSummary: row.ai_summary,
        lastAnalysedAt: row.last_analysed_at,
    };
}

export async function refreshCustomerInsights(
    customerId: string,
    uploadSessionId?: string
) {
    // 1. Calculate deterministic insights
    const insights =
        await calculateCustomerInsights(
            customerId
        );

    // 2. Get the customer's invoice currency
    const {
        data: invoices,
        error: invoiceError,
    } = await supabase
        .from("invoices")
        .select("currency")
        .eq(
            "customer_id",
            customerId
        );

    if (invoiceError) {
        throw invoiceError;
    }

    const currency =
        invoices?.[0]?.currency ?? "INR";

    // 3. Generate AI interpretation
    const {
        summary,
        usage,
    } =
        await generateCustomerInsightSummary(
            insights,
            currency
        );

    // 4. Persist everything
    const saved =
        await upsertCustomerInsights(
            customerId,
            insights,
            summary
        );

    // 5. Log detailed customer insight activity
    await logInvoiceActivity(
        null,
        customerId,
        ActivityTypes.CUSTOMER_INSIGHTS_UPDATED,
        "Customer payment insights updated",
        {
            totalInvoices:
                insights.totalInvoices,

            paidInvoiceCount:
                insights.paidInvoiceCount,

            openInvoiceCount:
                insights.openInvoiceCount,

            totalInvoicedAmount:
                insights.totalInvoicedAmount,

            totalCollectedAmount:
                insights.totalCollectedAmount,

            currentOutstandingAmount:
                insights.currentOutstandingAmount,

            overdueAmount:
                insights.overdueAmount,

            overdueInvoiceCount:
                insights.overdueInvoiceCount,

            onTimePaymentRate:
                insights.onTimePaymentRate,

            earlyPaymentRate:
                insights.earlyPaymentRate,

            latePaymentRate:
                insights.latePaymentRate,

            averageDelayDays:
                insights.averageDelayDays,

            averageLatePaymentDays:
                insights.averageLatePaymentDays,

            largestDelayDays:
                insights.largestDelayDays,

            lastPaymentDelayDays:
                insights.lastPaymentDelayDays,

            paymentConsistencyScore:
                insights.paymentConsistencyScore,

            paymentConfidence:
                insights.paymentConfidence,

            riskLevel:
                insights.riskLevel,

            predictedPaymentDays:
                insights.predictedPaymentDays,

            lastPaymentDate:
                insights.lastPaymentDate,

            paymentCount:
                insights.paymentCount,

            partialPaymentInvoiceCount:
                insights.partialPaymentInvoiceCount,

            averagePaymentsPerInvoice:
                insights.averagePaymentsPerInvoice,

            aiSummary: summary,
        }
    );

    // 6. Add customer insight to Employee Activity
    await logEmployeeActivity({
    uploadSessionId,
    activityType:
        "customer_insights_updated",
    message:
        `Payment behavior reassessed · ${insights.riskLevel} risk · ${insights.paymentConfidence}% confidence · ${currency} ${insights.currentOutstandingAmount.toLocaleString()}`,
});

    console.log(
        "🧠 Customer Insights Refreshed"
    );

    console.log(
        "Customer:",
        customerId
    );

    console.log(
        "Risk:",
        insights.riskLevel
    );

    console.log(
        "Confidence:",
        insights.paymentConfidence
    );

    console.log(
        "AI Tokens:",
        usage.totalTokens
    );

    return saved;
}