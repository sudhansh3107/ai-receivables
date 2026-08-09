import {
    getOutstandingAmount,
    getOutstandingLastMonth,
    getOverdueInvoiceCount,
    getOverdueInvoiceCountLastMonth,
    getInvoicesNeedingReview,
    getInvoicesNeedingReviewDetails,
    InvoiceNeedingReview,
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
    getLatestCustomerInsight,
} from "./customerInsightService";

import {
    getNextReminderForCustomer,
} from "./reminderService";

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

    needsApproval: number;
}

export interface DashboardInsight {
    customerName: string;

    noticed: string;

    nextAction: string | null;

    updatedAt: string;
}

export interface DashboardData {
    metrics: DashboardMetrics;

    activity: EmployeeActivity[];

    approvals: InvoiceNeedingReview[];

    insight: DashboardInsight | null;

    mission: unknown | null;
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

    needsApproval,
] = await Promise.all([
    getRecoveredThisMonth(),
    getRecoveredLastMonth(),

    getOutstandingAmount(),
    getOutstandingLastMonth(),

    getOverdueInvoiceCount(),
    getOverdueInvoiceCountLastMonth(),

    getInvoicesNeedingReview(),
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

        needsApproval,
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
    const latestInsight = await getLatestCustomerInsight();

    if (!latestInsight) {
        return null;
    }

    const nextReminder = await getNextReminderForCustomer(
        latestInsight.customerId
    );

    return {
        customerName: latestInsight.customerName,

        noticed: latestInsight.aiSummary,

        nextAction: nextReminder
            ? formatNextAction(
                  nextReminder.reminderStage,
                  nextReminder.channel,
                  nextReminder.scheduledAt
              )
            : null,

        updatedAt: latestInsight.lastAnalysedAt,
    };
}

export async function getDashboard(): Promise<DashboardData> {

    const [
        metrics,
        activity,
        approvals,
        insight,
    ] = await Promise.all([
        getDashboardMetrics(),
        getRecentActivity(3),
        getInvoicesNeedingReviewDetails(),
        getDashboardInsight(),
    ]);

    return {
        metrics,

        activity,

        approvals,

        insight,

        mission: null,
    };
}