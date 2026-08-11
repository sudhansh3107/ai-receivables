"use client";

import Link from "next/link";
import {
    ArrowLeft,
    CalendarDays,
    FileText,
    Handshake,
    IndianRupee,
    Mail,
    Phone,
    TriangleAlert,
} from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Page from "../components/ui/PageShell";
import Card from "../components/ui/Card";
import ActivityItem from "../components/headquarters/ActivityItem";
import { tokens } from "@/lib/theme/tokens";
import { toLocalDateString } from "@/lib/date";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";

import {
    getActivityHistory,
    ActivityHistoryEntry,
} from "@/services/server/activityLogService";

const ACTIVITY_TABLES = ["activity_log"];

// Module-level so it's a stable fetchData reference for
// useRealtimeRefresh; getActivityHistory() takes no session-scoped
// argument here (unlike the upload modal's per-session feed).
function fetchActivityHistory(): Promise<ActivityHistoryEntry[]> {
    return getActivityHistory();
}

const iconMap = {
    payment: IndianRupee,
    mail: Mail,
    phone: Phone,
    calendar: CalendarDays,
    document: FileText,
    warning: TriangleAlert,
    handshake: Handshake,
} as const;

const iconColorMap = {
    payment: "#8F6B4A",
    mail: "#8F6B4A",
    phone: "#8F6B4A",
    calendar: "#B88A4B",
    document: "#6E8F63",
    warning: "#C96D55",
    handshake: "#8F6B4A",
} as const;

interface ActivityGroup {
    label: string;
    entries: ActivityHistoryEntry[];
}

// Groups by calendar day using each entry's raw created_at — the
// mapper's `time` field is HH:MM only and stays untouched. Input is
// already ORDER BY created_at DESC, so a single linear pass produces
// contiguous, correctly-ordered groups without re-sorting.
function groupByDate(entries: ActivityHistoryEntry[]): ActivityGroup[] {
    const today = toLocalDateString(new Date());

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = toLocalDateString(yesterdayDate);

    const groups: ActivityGroup[] = [];

    for (const entry of entries) {
        const entryDate = toLocalDateString(new Date(entry.createdAt));

        const label =
            entryDate === today
                ? "Today"
                : entryDate === yesterday
                ? "Yesterday"
                : new Date(entry.createdAt).toLocaleDateString("en-IN", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                  });

        const lastGroup = groups[groups.length - 1];

        if (lastGroup && lastGroup.label === label) {
            lastGroup.entries.push(entry);
        } else {
            groups.push({ label, entries: [entry] });
        }
    }

    return groups;
}

export default function ActivityPage() {
    const { data: entries, error } = useRealtimeRefresh<
        ActivityHistoryEntry[]
    >(ACTIVITY_TABLES, fetchActivityHistory);

    const groups = entries ? groupByDate(entries) : [];

    return (
        <AppShell>
            <Page>
                <Link
                    href="/"
                    className="
                        mb-3
                        inline-flex
                        w-fit
                        items-center
                        gap-1.5
                        text-[13px]
                        font-medium
                        text-[#8B847C]
                        transition-colors
                        duration-200
                        hover:text-[#8F6B4A]
                    "
                >
                    <ArrowLeft size={15} strokeWidth={2} />
                    Back to Headquarters
                </Link>

                <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                    Activity
                </h1>

                <p className="mt-1 text-[14px] text-[#6B645C]">
                    {entries
                        ? `Most recent ${entries.length} recorded event${
                              entries.length === 1 ? "" : "s"
                          }, newest first.`
                        : "Recorded events, newest first."}
                </p>

                <Card className="mt-6 rounded-[30px]">
                    {error ? (
                        <p className="py-8 text-center text-[14px] text-[#C96D55]">
                            Couldn&apos;t load activity. Please try again.
                        </p>
                    ) : entries === null ? (
                        <p className="py-8 text-center text-[14px] text-[#8C857C]">
                            Loading…
                        </p>
                    ) : entries.length === 0 ? (
                        <p className="py-8 text-center text-[14px] text-[#8C857C]">
                            No activity recorded yet.
                        </p>
                    ) : (
                        <div className="space-y-6">
                            {groups.map((group) => (
                                <div key={group.label}>
                                    <h2
                                        style={{
                                            fontSize:
                                                tokens.typography.eyebrow
                                                    .fontSize,
                                            fontWeight:
                                                tokens.typography.eyebrow
                                                    .fontWeight,
                                            letterSpacing:
                                                tokens.typography.eyebrow
                                                    .letterSpacing,
                                            textTransform: "uppercase",
                                            color: tokens.semantic.textMuted,
                                        }}
                                    >
                                        {group.label}
                                    </h2>

                                    <div className="mt-1">
                                        {group.entries.map(
                                            (activity, index) => (
                                                <ActivityItem
                                                    key={activity.id}
                                                    time={activity.time}
                                                    icon={
                                                        iconMap[activity.icon]
                                                    }
                                                    iconColor={
                                                        iconColorMap[
                                                            activity.icon
                                                        ]
                                                    }
                                                    title={activity.title}
                                                    subtitle={
                                                        activity.subtitle
                                                    }
                                                    status={activity.status}
                                                    showLine={
                                                        index <
                                                        group.entries.length -
                                                            1
                                                    }
                                                />
                                            )
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            </Page>
        </AppShell>
    );
}
