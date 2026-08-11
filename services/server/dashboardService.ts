import {
    getOutstandingAmount,
    getOutstandingLastMonth,
    getOverdueInvoiceCount,
    getOverdueInvoiceCountLastMonth,
    getUnreviewedLowConfidenceInvoiceCount,
} from "@/services/invoiceService";

import { getProcessingInvoiceFileCount } from "@/services/invoiceFileService";

import {
    getRecoveredThisMonth,
    getRecoveredLastMonth,
} from "./paymentService";

import {
    getRecentActivity,
    getPaymentOutcomesTodayCount,
} from "./activityLogService";

import {
    EmployeeActivity,
} from "./activityMapper";

import {
    getMostUrgentCustomerInsight,
} from "./customerInsightService";

import {
    getNextReminderForCustomer,
} from "./reminderService";

import {
    getDecisionQueue,
    DecisionQueue,
} from "./decisionService";

import { getReceivedEmailCount } from "./emailService";

export interface Metric {
    value: number;
    change: number;
}

export interface DashboardMetrics {
    cashRecovered: Metric;

    outstanding: Metric;

    overdueInvoices: {
        value: number;
        difference: number;
    };

    needsReview: number;
}

export interface DashboardInsight {
    customerName: string;

    noticed: string;

    nextAction: string | null;

    updatedAt: string;
}

// Mission Card = Employee #001's own workload + human decisions +
// completed outcomes, kept strictly non-overlapping:
//   activeWork      — durable, EMPLOYEE-owned unresolved work only
//                      (emails not yet gated/classified, invoice
//                      files currently being extracted). Never
//                      payment_decisions, reminders, low-confidence
//                      invoices, or execution_status='executing' —
//                      those are human-owned or purely transient.
//   decisions       — human-owned unresolved work. Always identical
//                      to Needs Your Decision's total, because it's
//                      literally the same getDecisionQueue().totalCount
//                      value, passed in by the caller rather than
//                      recomputed here.
//   completedToday  — meaningful completed business outcomes only
//                      (see activityLogService.ts::
//                      getPaymentOutcomesTodayCount()), never human
//                      decision resolutions.
//   completionPercentage — completedToday / (completedToday +
//                      activeWork), deliberately excluding decisions
//                      from the denominator (decisions are not
//                      employee work, so they must never depress this
//                      number). 100 when the denominator is 0.
export interface MissionSummary {
    activeWork: number;
    decisions: number;
    completedToday: number;
    completionPercentage: number;
}

export interface DashboardData {
    metrics: DashboardMetrics;

    activity: EmployeeActivity[];

    decisionQueue: DecisionQueue;

    insight: DashboardInsight | null;

    mission: MissionSummary | null;
}

function calculatePercentageChange(
    current: number,
    previous: number
) {
    if (previous === 0) {
        return current > 0 ? 100 : 0;
    }

    return ((current - previous) / previous) * 100;
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {

   const [
    recoveredThisMonth,
    recoveredLastMonth,

    outstanding,
    outstandingLastMonth,

    overdueInvoices,
    overdueInvoicesLastMonth,

    needsReview,
] = await Promise.all([
    getRecoveredThisMonth(),
    getRecoveredLastMonth(),

    getOutstandingAmount(),
    getOutstandingLastMonth(),

    getOverdueInvoiceCount(),
    getOverdueInvoiceCountLastMonth(),

    getUnreviewedLowConfidenceInvoiceCount(),
]);

    return {
        cashRecovered: {
            value: recoveredThisMonth,
            change: calculatePercentageChange(
                recoveredThisMonth,
                recoveredLastMonth
            ),
        },

        outstanding: {
            value: outstanding,

            // We'll replace this with live data next.
            change: calculatePercentageChange(
        outstanding,
        outstandingLastMonth
        ),
        },

        overdueInvoices: {
            value: overdueInvoices,

            // Live comparison comes next.
            difference: overdueInvoices -
        overdueInvoicesLastMonth,
        },

        needsReview,
    };
}

function formatNextAction(
    reminderStage: number,
    channel: string,
    scheduledAt: string
) {
    const formattedDate = new Date(
        scheduledAt
    ).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
    });

    return `Stage ${reminderStage} ${channel} reminder scheduled for ${formattedDate}`;
}

async function getDashboardInsight(): Promise<DashboardInsight | null> {
    const urgentInsight = await getMostUrgentCustomerInsight();

    if (!urgentInsight) {
        return null;
    }

    const nextReminder = await getNextReminderForCustomer(
        urgentInsight.customerId
    );

    return {
        customerName: urgentInsight.customerName,

        noticed: urgentInsight.aiSummary,

        nextAction: nextReminder
            ? formatNextAction(
                  nextReminder.reminderStage,
                  nextReminder.channel,
                  nextReminder.scheduledAt
              )
            : null,

        updatedAt: urgentInsight.lastAnalysedAt,
    };
}

// completedToday is intentionally excluded from its own denominator's
// "still owned by the employee" side, and decisions never enters the
// formula at all — decisions are human-owned, so their volume must
// never depress or inflate how "done" the employee's OWN work looks.
function calculateCompletionPercentage(
    completedToday: number,
    activeWork: number
): number {
    const denominator = completedToday + activeWork;

    if (denominator === 0) {
        return 100;
    }

    const raw = (completedToday / denominator) * 100;

    return Math.min(100, Math.max(0, Math.round(raw)));
}

// `decisions` is passed in rather than recomputed here so the Mission
// Card's DECISIONS count is always the literal same number Needs Your
// Decision shows (getDecisionQueue().totalCount) — never a second,
// independently-computed definition that could drift out of sync.
async function getMissionSummary(
    decisions: number
): Promise<MissionSummary> {
    const [emailsReceived, invoiceFilesProcessing, completedToday] =
        await Promise.all([
            getReceivedEmailCount(),
            getProcessingInvoiceFileCount(),
            getPaymentOutcomesTodayCount(),
        ]);

    const activeWork = emailsReceived + invoiceFilesProcessing;

    return {
        activeWork,
        decisions,
        completedToday,
        completionPercentage: calculateCompletionPercentage(
            completedToday,
            activeWork
        ),
    };
}

export async function getDashboard(): Promise<DashboardData> {
    // decisionQueue is fetched once and its totalCount reused for
    // MissionSummary.decisions below, rather than each independently
    // recomputing getDecisionQueue() — guarantees the two dashboard
    // surfaces can never disagree and avoids paying for the same
    // aggregate query twice per dashboard load.
    const decisionQueue = await getDecisionQueue();

    const [metrics, activity, insight, mission] = await Promise.all([
        getDashboardMetrics(),
        getRecentActivity(3),
        getDashboardInsight(),
        getMissionSummary(decisionQueue.totalCount),
    ]);

    return {
        metrics,

        activity,

        decisionQueue,

        insight,

        mission,
    };
}
