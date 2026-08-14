"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    ArrowLeft,
    Handshake,
    Mail,
    ShieldAlert,
    TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

import AppShell from "../../components/layout/AppShell";
import Page from "../../components/ui/PageShell";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import ActivityItem from "../../components/headquarters/ActivityItem";
import { tokens } from "@/lib/theme/tokens";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";
import {
    getCollectionCaseDetail,
    type CollectionCaseDetail,
    type CommunicationEntry,
} from "@/services/server/collectionCaseDashboardService";
import {
    resumeCollectionCaseRequest,
    resolveCollectionCaseRequest,
    deferCollectionCaseRequest,
} from "@/lib/collectionCaseActions";

const DETAIL_TABLES = ["collection_cases", "activity_log", "emails"];

const STATUS_LABELS: Record<CollectionCaseDetail["status"], string> = {
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
    CollectionCaseDetail["status"],
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

function formatCurrency(amount: number | null, currency: string | null): string {
    if (amount === null) return "—";

    const locale = currency === "INR" ? "en-IN" : "en-US";

    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency ?? "INR",
        maximumFractionDigits: 0,
    }).format(amount);
}

function communicationIcon(entry: CommunicationEntry) {
    if (entry.direction === "inbound") return Mail;

    if (
        entry.activityType === "collection_case_escalated" ||
        entry.activityType === "collection_dispute_opened" ||
        entry.activityType === "collection_blocker_opened" ||
        entry.activityType === "collection_promise_broken"
    ) {
        return TriangleAlert;
    }

    if (
        entry.activityType === "collection_promise_acknowledged" ||
        entry.activityType === "collection_exception_resolved" ||
        entry.activityType === "collection_case_resolved" ||
        entry.activityType === "collection_case_resumed_by_human"
    ) {
        return Handshake;
    }

    return Mail;
}

function communicationTitle(entry: CommunicationEntry): string {
    if (entry.direction === "inbound") {
        return entry.subject ?? "Customer email";
    }

    if (entry.subject) return entry.subject;

    const labels: Record<string, string> = {
        collection_case_opened: "Collection case opened",
        collection_blocker_opened: "Blocker reported",
        collection_exception_resolved: "Exception resolved",
        collection_case_escalated: "Case escalated",
        collection_case_resolved: "Case resolved",
        collection_case_resumed_by_human: "Case resumed",
    };

    return labels[entry.activityType ?? ""] ?? "Activity recorded";
}

export default function CollectionCaseDetailPage() {
    const params = useParams<{ id: string }>();
    const caseId = params.id;

    const fetchDetail = useCallback(async () => {
        return getCollectionCaseDetail(caseId);
    }, [caseId]);

    const {
        data: detail,
        loading,
        error,
        refresh,
    } = useRealtimeRefresh<CollectionCaseDetail | null>(
        DETAIL_TABLES,
        fetchDetail
    );

    const [actionPending, setActionPending] = useState<string | null>(null);

    async function handleAction(
        action: "resume" | "resolve" | "wait"
    ) {
        setActionPending(action);

        try {
            if (action === "resume") {
                await resumeCollectionCaseRequest(caseId);
            } else if (action === "resolve") {
                await resolveCollectionCaseRequest(caseId);
            } else {
                await deferCollectionCaseRequest(caseId);
            }

            await refresh();
        } catch (err) {
            console.error(err);
            toast.error("Couldn't update this case. Please try again.");
        } finally {
            setActionPending(null);
        }
    }

    return (
        <AppShell>
            <Page>
                <Link
                    href="/collections"
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
                    Back to Collections
                </Link>

                {error ? (
                    <p className="py-8 text-center text-[14px] text-[#C96D55]">
                        Couldn&apos;t load this collection case. Please try again.
                    </p>
                ) : loading ? (
                    <p className="py-8 text-center text-[14px] text-[#8C857C]">
                        Loading…
                    </p>
                ) : !detail ? (
                    <p className="py-8 text-center text-[14px] text-[#8C857C]">
                        Collection case not found.
                    </p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                                {detail.customerName}
                            </h1>

                            <span
                                className="whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium"
                                style={{
                                    background: STATUS_TONE[detail.status].background,
                                    color: STATUS_TONE[detail.status].text,
                                }}
                            >
                                {STATUS_LABELS[detail.status]}
                            </span>
                        </div>

                        <p className="mt-1 text-[14px] text-[#6B645C]">
                            {detail.lastDecisionReason ?? "No decision recorded yet."}
                        </p>

                        {detail.status === "escalated" && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Button
                                    variant="primary"
                                    disabled={actionPending !== null}
                                    onClick={() => handleAction("resume")}
                                >
                                    {actionPending === "resume"
                                        ? "Resuming…"
                                        : "Resume outreach"}
                                </Button>

                                <Button
                                    variant="secondary"
                                    disabled={actionPending !== null}
                                    onClick={() => handleAction("wait")}
                                >
                                    {actionPending === "wait"
                                        ? "Saving…"
                                        : "Keep monitoring"}
                                </Button>

                                <Button
                                    variant="secondary"
                                    disabled={actionPending !== null}
                                    onClick={() => handleAction("resolve")}
                                >
                                    {actionPending === "resolve"
                                        ? "Resolving…"
                                        : "Mark resolved"}
                                </Button>
                            </div>
                        )}

                        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
                            <Card className="rounded-[24px]">
                                <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8B847C]">
                                    Case
                                </h2>

                                <dl className="mt-3 space-y-2.5 text-[13px]">
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[#8B847C]">Opened</dt>
                                        <dd className="text-[#1A1A1A]">
                                            {formatDateTime(detail.openedAt)}
                                        </dd>
                                    </div>

                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[#8B847C]">Last action</dt>
                                        <dd className="text-[#1A1A1A]">
                                            {formatDateTime(detail.lastActionAt)}
                                        </dd>
                                    </div>

                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[#8B847C]">Next evaluation</dt>
                                        <dd className="text-[#1A1A1A]">
                                            {formatDateTime(detail.nextEvaluationAt)}
                                        </dd>
                                    </div>

                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[#8B847C]">Outreach sent</dt>
                                        <dd className="text-[#1A1A1A]">
                                            {detail.outreachCount} (
                                            {detail.unansweredOutreachCount} unanswered)
                                        </dd>
                                    </div>

                                    {detail.triggeringInvoiceNumber && (
                                        <div className="flex justify-between gap-4">
                                            <dt className="text-[#8B847C]">
                                                Triggering invoice
                                            </dt>
                                            <dd className="text-[#1A1A1A]">
                                                {detail.triggeringInvoiceNumber}
                                            </dd>
                                        </div>
                                    )}

                                    {detail.closedAt && (
                                        <div className="flex justify-between gap-4">
                                            <dt className="text-[#8B847C]">Closed</dt>
                                            <dd className="text-[#1A1A1A]">
                                                {formatDateTime(detail.closedAt)} (
                                                {detail.closedReason ?? "unknown"})
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </Card>

                            <Card className="rounded-[24px]">
                                <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8B847C]">
                                    Promise &amp; exception
                                </h2>

                                <dl className="mt-3 space-y-2.5 text-[13px]">
                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[#8B847C]">Promise status</dt>
                                        <dd className="text-[#1A1A1A]">
                                            {detail.promiseStatus ?? "None"}
                                        </dd>
                                    </div>

                                    {detail.promiseStatus && (
                                        <>
                                            <div className="flex justify-between gap-4">
                                                <dt className="text-[#8B847C]">
                                                    Promised amount
                                                </dt>
                                                <dd className="text-[#1A1A1A]">
                                                    {formatCurrency(
                                                        detail.promiseAmount,
                                                        detail.promiseCurrency
                                                    )}
                                                </dd>
                                            </div>

                                            <div className="flex justify-between gap-4">
                                                <dt className="text-[#8B847C]">
                                                    Promise date
                                                </dt>
                                                <dd className="text-[#1A1A1A]">
                                                    {detail.promiseDate ?? "—"}
                                                </dd>
                                            </div>
                                        </>
                                    )}

                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[#8B847C]">Broken promises</dt>
                                        <dd className="text-[#1A1A1A]">
                                            {detail.brokenPromiseCount}
                                        </dd>
                                    </div>

                                    <div className="flex justify-between gap-4">
                                        <dt className="text-[#8B847C]">Exception</dt>
                                        <dd className="text-[#1A1A1A]">
                                            {detail.exceptionCategory
                                                ? `${detail.exceptionCategory} (${
                                                      detail.exceptionStatus ?? "open"
                                                  })`
                                                : "None"}
                                        </dd>
                                    </div>

                                    {detail.escalationReason && (
                                        <div className="flex items-start gap-2 rounded-xl bg-[#FBE8E6] p-3">
                                            <ShieldAlert
                                                size={16}
                                                strokeWidth={2}
                                                className="mt-0.5 shrink-0 text-[#C96D55]"
                                            />
                                            <span className="text-[12px] text-[#C96D55]">
                                                {detail.escalationReason}
                                            </span>
                                        </div>
                                    )}
                                </dl>
                            </Card>
                        </div>

                        <Card className="mt-6 rounded-[30px]">
                            <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#8B847C]">
                                Communication history
                            </h2>

                            {detail.communicationHistory.length === 0 ? (
                                <p className="py-6 text-center text-[13px] text-[#8C857C]">
                                    No communication recorded yet.
                                </p>
                            ) : (
                                <div className="mt-2">
                                    {detail.communicationHistory.map((entry, index) => (
                                        <ActivityItem
                                            key={entry.id}
                                            time={new Date(
                                                entry.timestamp
                                            ).toLocaleString("en-IN", {
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                            icon={communicationIcon(entry)}
                                            iconColor={
                                                entry.direction === "inbound"
                                                    ? tokens.status.info.text
                                                    : "#8F6B4A"
                                            }
                                            title={communicationTitle(entry)}
                                            subtitle={
                                                entry.body
                                                    ? entry.body.slice(0, 160)
                                                    : ""
                                            }
                                            status={
                                                entry.direction === "inbound"
                                                    ? "Received"
                                                    : "Sent"
                                            }
                                            showLine={
                                                index <
                                                detail.communicationHistory.length - 1
                                            }
                                        />
                                    ))}
                                </div>
                            )}
                        </Card>
                    </>
                )}
            </Page>
        </AppShell>
    );
}
