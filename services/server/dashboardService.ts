import {
    getOutstandingAmount,
    getOutstandingLastMonth,
    getOverdueInvoiceCount,
    getOverdueInvoiceCountLastMonth,
    getInvoicesNeedingReview,
    
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

export interface DashboardData {
    metrics: DashboardMetrics;

    activity: EmployeeActivity[];

    approvals: unknown[];

    insight: unknown | null;

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

export async function getDashboard(): Promise<DashboardData> {

    const [
        metrics,
        activity,
    ] = await Promise.all([
        getDashboardMetrics(),
        getRecentActivity(3),
    ]);

    return {
        metrics,

        activity,

        approvals: [],

        insight: null,

        mission: null,
    };
}