import {
    getOutstandingAmount,
    getOutstandingLastMonth,
    getOverdueInvoiceCount,
    getOverdueInvoiceCountLastMonth,
    getUnreviewedLowConfidenceInvoiceCount,
    getInvoiceReviewsCompletedTodayCount,
} from "@/services/invoiceService";

import {
    getRecoveredThisMonth,
    getRecoveredLastMonth,
} from "./paymentService";

import {
    getRecentActivity,
} from "./activityLogService";

import {
    EmployeeActivity,
} from "./activityMapper";

import {
    getMostUrgentCustomerInsight,
} from "./customerInsightService";

import {
    getNextReminderForCustomer,
    getRemindersNeedingAttentionCount,
    getReminderFollowUpsActionedTodayCount,
} from "./reminderService";

import {
    getDecisionQueue,
    DecisionQueue,
} from "./decisionService";

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

// Mission = today's explicit actionable AR work, completed vs. still
// relevant — not invoice status, not payment activity, not a
// financial rollup (that's MetricsPanel). completedToday only ever
// reflects explicit human action evidence (reminders.actioned_at /
// invoices.confidence_reviewed_at) — never inferred from payments or
// activity_log events.
export interface MissionSummary {
    completedToday: number;

    remainingToday: number;
    remainingFollowUps: number;
    remainingReviews: number;
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

async function getMissionSummary(): Promise<MissionSummary> {
    const [
        remainingFollowUps,
        remainingReviews,
        followUpsActionedToday,
        reviewsCompletedToday,
    ] = await Promise.all([
        getRemindersNeedingAttentionCount(),
        getUnreviewedLowConfidenceInvoiceCount(),
        getReminderFollowUpsActionedTodayCount(),
        getInvoiceReviewsCompletedTodayCount(),
    ]);

    return {
        completedToday: followUpsActionedToday + reviewsCompletedToday,

        remainingToday: remainingFollowUps + remainingReviews,
        remainingFollowUps,
        remainingReviews,
    };
}

export async function getDashboard(): Promise<DashboardData> {

    const [
        metrics,
        activity,
        decisionQueue,
        insight,
        mission,
    ] = await Promise.all([
        getDashboardMetrics(),
        getRecentActivity(3),
        getDecisionQueue(),
        getDashboardInsight(),
        getMissionSummary(),
    ]);

    return {
        metrics,

        activity,

        decisionQueue,

        insight,

        mission,
    };
}
