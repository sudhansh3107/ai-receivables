"use client";

import {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import { supabase } from "@/lib/supabase";

import {
    DashboardData,
    getDashboard,
} from "@/services/server/dashboardService";

export function useDashboard() {
    const [dashboard, setDashboard] =
        useState<DashboardData | null>(null);

    const [loading, setLoading] =
        useState(true);
    
    const hasLoaded = useRef(false);
    const [error, setError] =
        useState<Error | null>(null);

    const refreshTimeout =
        useRef<NodeJS.Timeout | null>(null);

    const refresh = useCallback(async () => {
        try {
            console.log("🔄 Dashboard Refresh Triggered");

            setLoading(true);

            const data = await getDashboard();

            console.log("📊 Dashboard Updated", data);

            setDashboard(data);

            setError(null);
        } catch (err) {
            console.error("❌ Dashboard Refresh Failed", err);
            setError(err as Error);
        } finally {
            setLoading(false);
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
                    console.log(`📡 ${table} changed`);
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

        channel.subscribe((status) => {
            console.log("📶 Dashboard Realtime:", status);
        });

        return () => {
            if (refreshTimeout.current) {
                clearTimeout(refreshTimeout.current);
            }

            supabase.removeChannel(channel);
        };
    }, [refresh, refreshDebounced]);

    return {
        dashboard,
        loading,
        error,
        refresh,
    };
}