"use client";

import { createContext, ReactNode, useContext } from "react";

import {
    DashboardData,
    getDashboard,
} from "@/services/server/dashboardService";
import { useRealtimeRefresh } from "./useRealtimeRefresh";

interface DashboardContextValue {
    dashboard: DashboardData | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    suppressAutoRefresh: () => void;
    resumeAutoRefresh: () => void;
}

const DashboardContext =
    createContext<DashboardContextValue | null>(null);

const DASHBOARD_TABLES = [
    "payments",
    "invoices",
    "customers",
    "activity_log",
    "employee_activity",
    "invoice_files",
    "upload_sessions",
    "reminders",
];

// Single shared dashboard fetch + Realtime subscription for the
// whole Headquarters page. Every card consumes this via useDashboard()
// below instead of each mounting its own independent instance — one
// initial fetch, one Realtime channel, one debounced refresh, no
// matter how many cards read the data. The fetch/subscribe/debounce/
// race-guard mechanics themselves now live in the shared
// useRealtimeRefresh hook — this provider is just Dashboard-shaped
// wiring on top of it.
export function DashboardProvider({
    children,
}: {
    children: ReactNode;
}) {
    const {
        data: dashboard,
        loading,
        error,
        refresh,
        suppressAutoRefresh,
        resumeAutoRefresh,
    } = useRealtimeRefresh<DashboardData>(
        DASHBOARD_TABLES,
        getDashboard
    );

    return (
        <DashboardContext.Provider
            value={{
                dashboard,
                loading,
                error,
                refresh,
                suppressAutoRefresh,
                resumeAutoRefresh,
            }}
        >
            {children}
        </DashboardContext.Provider>
    );
}

export function useDashboard(): DashboardContextValue {
    const context = useContext(DashboardContext);

    if (!context) {
        throw new Error(
            "useDashboard must be used within a DashboardProvider"
        );
    }

    return context;
}
