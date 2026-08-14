"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";

import AppShell from "../components/layout/AppShell";
import Page from "../components/ui/PageShell";
import Card from "../components/ui/Card";
import { tokens } from "@/lib/theme/tokens";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";
import {
    getCollectionCaseList,
    type CollectionCaseSummary,
} from "@/services/server/collectionCaseDashboardService";

const CASES_TABLE = ["collection_cases"];

async function fetchCases(): Promise<CollectionCaseSummary[]> {
    return getCollectionCaseList();
}

const STATUS_LABELS: Record<CollectionCaseSummary["status"], string> = {
    open: "Open",
    awaiting_response: "Awaiting response",
    promise_to_pay: "Promise to pay",
    payment_blocked: "Blocked",
    disputed: "Disputed",
    unresponsive: "Unresponsive",
    escalated: "Escalated",
    resolved: "Resolved",
};

const STATUS_TONE: Record<
    CollectionCaseSummary["status"],
    { background: string; text: string }
> = {
    open: tokens.status.info,
    awaiting_response: tokens.status.info,
    promise_to_pay: tokens.status.completed,
    payment_blocked: tokens.status.pending,
    disputed: tokens.status.pending,
    unresponsive: tokens.status.overdue,
    escalated: tokens.status.overdue,
    resolved: tokens.status.completed,
};

function formatDateTime(value: string | null): string {
    if (!value) return "—";

    return new Date(value).toLocaleString("en-IN", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function CollectionsPage() {
    const { data: cases, error } = useRealtimeRefresh<CollectionCaseSummary[]>(
        CASES_TABLE,
        fetchCases
    );

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
                    Collections
                </h1>

                <p className="mt-1 text-[14px] text-[#6B645C]">
                    Every collection case the employee owns, its current state, and
                    what happens next.
                </p>

                <Card className="mt-6 rounded-[30px]">
                    {error ? (
                        <p className="py-8 text-center text-[14px] text-[#C96D55]">
                            Couldn&apos;t load collection cases. Please try again.
                        </p>
                    ) : cases === null ? (
                        <p className="py-8 text-center text-[14px] text-[#8C857C]">
                            Loading…
                        </p>
                    ) : cases.length === 0 ? (
                        <p className="py-8 text-center text-[14px] text-[#8C857C]">
                            No collection cases yet.
                        </p>
                    ) : (
                        <div className="space-y-3">
                            {cases.map((collectionCase) => {
                                const tone = STATUS_TONE[collectionCase.status];

                                return (
                                    <Link
                                        key={collectionCase.id}
                                        href={`/collections/${collectionCase.id}`}
                                        className="
                                            group
                                            flex
                                            w-full
                                            items-center
                                            justify-between
                                            gap-4
                                            rounded-2xl
                                            border
                                            border-[#ECE4DA]
                                            bg-[#FCFAF7]
                                            p-5
                                            transition-all
                                            duration-300
                                            hover:border-[#E1D4C5]
                                            hover:bg-[#F9F6F2]
                                        "
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2.5">
                                                <h3 className="truncate text-[14px] font-semibold tracking-[-0.01em] text-[#1A1A1A]">
                                                    {collectionCase.customerName}
                                                </h3>

                                                <span
                                                    className="whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11px] font-medium"
                                                    style={{
                                                        background: tone.background,
                                                        color: tone.text,
                                                    }}
                                                >
                                                    {STATUS_LABELS[collectionCase.status]}
                                                </span>
                                            </div>

                                            <p className="mt-1.5 truncate text-[12px] text-[#6B645C]">
                                                {collectionCase.lastDecisionReason ??
                                                    "No decision recorded yet."}
                                            </p>

                                            <p className="mt-1 text-[11px] text-[#8B847C]">
                                                {collectionCase.outreachCount} outreach
                                                {collectionCase.outreachCount === 1 ? "" : "es"}
                                                {collectionCase.brokenPromiseCount > 0
                                                    ? ` · ${collectionCase.brokenPromiseCount} broken promise${
                                                          collectionCase.brokenPromiseCount === 1
                                                              ? ""
                                                              : "s"
                                                      }`
                                                    : ""}
                                                {" · Next review "}
                                                {formatDateTime(collectionCase.nextEvaluationAt)}
                                            </p>
                                        </div>

                                        <ChevronRight
                                            size={19}
                                            strokeWidth={2}
                                            className="
                                                shrink-0
                                                text-[#7D7D7D]
                                                transition-colors
                                                duration-300
                                                group-hover:text-[#8F6B4A]
                                            "
                                        />
                                    </Link>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </Page>
        </AppShell>
    );
}
