"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

export interface UseRealtimeRefreshResult<T> {
    data: T | null;
    loading: boolean;
    error: Error | null;
    refresh: () => Promise<void>;
    suppressAutoRefresh: () => void;
    resumeAutoRefresh: () => void;
}

const DEBOUNCE_MS = 250;

// Generalized extraction of the Realtime-driven refetch pattern
// proven in Mission Control's dashboard (formerly inline in
// useDashboard.tsx): subscribe to postgres_changes on the given
// tables, debounce bursts of changes into a single refetch (so rapid
// successive writes never trigger a refetch storm), and guard against
// races/unmounts so only the latest in-flight fetch can ever commit
// state. One dedicated channel per hook instance/mount — callers each
// own their own subscription, so no two consumers ever share (or
// duplicate) a channel.
export function useRealtimeRefresh<T>(
    tables: string[],
    fetchData: () => Promise<T>
): UseRealtimeRefreshResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    // Tracks whether any fetch has ever succeeded, without making
    // `refresh` depend on `data` — that's the difference between
    // "initial load" and "background refresh".
    const hasLoadedRef = useRef(false);

    // Version guard: only the response to the MOST RECENTLY issued
    // request is ever allowed to commit state. A slower, older refresh
    // that resolves after a newer one has already committed is
    // discarded, regardless of resolution order.
    const requestIdRef = useRef(0);

    const isMountedRef = useRef(true);

    const refreshTimeout = useRef<NodeJS.Timeout | null>(null);

    // Gates ONLY the Realtime-event-driven debounced path — never
    // `refresh()` itself, which must always remain directly callable.
    // Realtime stays fully subscribed throughout; this only decides
    // whether an incoming event is allowed to trigger an automatic
    // fetch right now.
    const suppressAutoRefreshRef = useRef(false);

    // fetchData/tables are captured ONCE via useRef's lazy initializer
    // (never reassigned — mutating .current during render is itself a
    // lint violation) rather than as effect dependencies, so a caller
    // passing a fresh closure/array identity each render never tears
    // down and reopens the Realtime channel. Every call site in this
    // codebase passes a module-level stable reference (a top-level
    // function and a top-level table-name array), so capturing the
    // first value is correct, not just an approximation.
    const fetchDataRef = useRef(fetchData);
    const tablesRef = useRef(tables);

    const suppressAutoRefresh = useCallback(() => {
        suppressAutoRefreshRef.current = true;
    }, []);

    const resumeAutoRefresh = useCallback(() => {
        suppressAutoRefreshRef.current = false;
    }, []);

    // Deliberately has an EMPTY dependency array so its identity never
    // changes across renders — see hasLoadedRef note above for why.
    const refresh = useCallback(async () => {
        const thisRequestId = ++requestIdRef.current;
        const isInitialLoad = !hasLoadedRef.current;

        if (isInitialLoad) {
            setLoading(true);
        }

        try {
            const result = await fetchDataRef.current();

            if (
                !isMountedRef.current ||
                thisRequestId !== requestIdRef.current
            ) {
                return;
            }

            hasLoadedRef.current = true;
            setData(result);
            setError(null);
        } catch (err) {
            if (
                !isMountedRef.current ||
                thisRequestId !== requestIdRef.current
            ) {
                return;
            }

            console.error("Realtime refresh failed", err);

            // Only the initial load surfaces an error state — a
            // background refresh failure must never blank already-
            // visible data or flip the whole view into an error state.
            // It's logged and otherwise silently ignored; the next
            // Realtime event will try again.
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
        if (suppressAutoRefreshRef.current) {
            return;
        }

        if (refreshTimeout.current) {
            clearTimeout(refreshTimeout.current);
        }

        refreshTimeout.current = setTimeout(() => {
            void refresh();
        }, DEBOUNCE_MS);
    }, [refresh]);

    useEffect(() => {
        isMountedRef.current = true;

        void refresh();

        const channel = supabase.channel(
            `realtime-refresh-${crypto.randomUUID()}`
        );

        for (const table of tablesRef.current) {
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
        }

        channel.subscribe();

        return () => {
            isMountedRef.current = false;

            if (refreshTimeout.current) {
                clearTimeout(refreshTimeout.current);
            }

            supabase.removeChannel(channel);
        };
    }, [refresh, refreshDebounced]);

    return {
        data,
        loading,
        error,
        refresh,
        suppressAutoRefresh,
        resumeAutoRefresh,
    };
}
