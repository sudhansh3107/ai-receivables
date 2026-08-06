"use client";

import { useCallback, useEffect, useState } from "react";

import {
    DashboardData,
    getDashboard,
} from "@/services/server/dashboardService";

export function useDashboard() {
    const [dashboard, setDashboard] =
        useState<DashboardData | null>(null);

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState<Error | null>(null);

    const refresh = useCallback(async () => {
        try {
            setLoading(true);

            const data = await getDashboard();

            setDashboard(data);

            setError(null);
        } catch (err) {
            setError(err as Error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return {
        dashboard,
        loading,
        error,
        refresh,
    };
}