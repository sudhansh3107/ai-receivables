"use client";

import {
    createContext,
    ReactNode,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
} from "react";

import { supabase } from "@/lib/supabase";

import {
    DashboardData,
    getDashboard,
} from "@/services/server/dashboardService";

interface DashboardContextValue {
    dashboard: DashboardData | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
}

const DashboardContext =
    createContext<DashboardContextValue | null>(null);

// Single shared dashboard fetch + Realtime subscription for the
// whole Headquarters page. Every card consumes this via useDashboard()
// below instead of each mounting its own independent instance — one
// initial fetch, one Realtime channel, one debounced refresh, no
// matter how many cards read the data.
export function DashboardProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [dashboard, setDashboard] =
        useState<DashboardData | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState<Error | null>(null);

    // Tracks whether any fetch has ever succeeded, without making
    // `refresh` depend on `dashboard` state (see note below) — that's
    // the difference between "initial load" and "background refresh".
    const hasLoadedRef = useRef(false);

    // Version guard: only the response to the MOST RECENTLY issued
    // request is ever allowed to commit state. A slower, older
    // refresh that resolves after a newer one has already committed
    // is discarded, regardless of resolution order.
    const requestIdRef = useRef(0);

    const isMountedRef = useRef(true);

    const refreshTimeout =
        useRef<NodeJS.Timeout | null>(null);

    // Deliberately has an EMPTY dependency array so its identity
    // never changes across renders. If it depended on `dashboard`
    // (to know whether this is the initial load), it would be
    // recreated on every data update, which would cascade into
    // recreating refreshDebounced and re-running the Realtime-
    // subscription effect below — tearing down and reopening the
    // channel on every refresh. hasLoadedRef sidesteps this by
    // tracking "has data ever loaded" outside of React state.
    const refresh = useCallback(async () => {
        const thisRequestId = ++requestIdRef.current;
        const isInitialLoad = !hasLoadedRef.current;

        if (isInitialLoad) {
            setLoading(true);
        }

        try {
            const data = await getDashboard();

            // A newer refresh was issued while this one was in
            // flight — its result should win instead, so discard
            // this now-stale response.
            if (
                !isMountedRef.current ||
                thisRequestId !== requestIdRef.current
            ) {
                return;
            }

            hasLoadedRef.current = true;
            setDashboard(data);
            setError(null);
        } catch (err) {
            if (
                !isMountedRef.current ||
                thisRequestId !== requestIdRef.current
            ) {
                return;
            }

            console.error("Dashboard refresh failed", err);

            // Only the initial load surfaces an error state — a
            // background refresh failure must never blank already-
            // visible dashboard data or flip the whole page into an
            // error state. It's logged and otherwise silently
            // ignored; the next Realtime event will try again.
            if (isInitialLoad) {
                setError(err as Error);
            }
        } finally {
            if (
                isInitialLoad &&
                isMountedRef.current &&
                thisRequestId === requestIdRef.current
            ) {
                setLoading(false);
            }
        }
    }, []);

    const refreshDebounced = useCallback(() => {
        if (refreshTimeout.current) {
            clearTimeout(refreshTimeout.current);
        }

        refreshTimeout.current = setTimeout(() => {
            void refresh();
        }, 250);
    }, [refresh]);

    useEffect(() => {
        isMountedRef.current = true;

        void refresh();

        const channel = supabase.channel(
            `dashboard-${crypto.randomUUID()}`
        );

        const subscribe = (table: string) => {
            channel.on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table,
                },
                () => {
                    refreshDebounced();
                }
            );
        };

        subscribe("payments");
        subscribe("invoices");
        subscribe("customers");
        subscribe("activity_log");
        subscribe("employee_activity");
        subscribe("invoice_files");
        subscribe("upload_sessions");
        subscribe("reminders");

        channel.subscribe();

        return () => {
            isMountedRef.current = false;

            if (refreshTimeout.current) {
                clearTimeout(refreshTimeout.current);
            }

            supabase.removeChannel(channel);
        };
    }, [refresh, refreshDebounced]);

    return (
        <DashboardContext.Provider
            value={{ dashboard, loading, error, refresh }}
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
