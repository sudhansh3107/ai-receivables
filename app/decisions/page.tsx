"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, FileWarning, LucideIcon } from "lucide-react";
import { toast } from "sonner";

import AppShell from "../components/layout/AppShell";
import Page from "../components/ui/PageShell";
import Card from "../components/ui/Card";
import DecisionItem from "../components/headquarters/DecisionItem";
import PaymentDecisionFeed from "../components/headquarters/PaymentDecisionFeed";
import { tokens } from "@/lib/theme/tokens";
import { useRealtimeRefresh } from "../hooks/useRealtimeRefresh";

import {
    getDecisionQueue,
    DecisionKind,
    DecisionCandidate,
} from "@/services/server/decisionService";
import { markInvoiceReviewed } from "@/services/invoiceService";
import { markReminderActioned } from "@/services/server/reminderService";

// Every table getDecisionQueue()'s candidates are derived from:
// low_confidence from invoices, payment_follow_up from reminders, and
// (were it included here) payment_decision from payment_decisions.
// Kept as a module-level constant for a stable reference across
// renders.
const DECISION_TABLES = ["payment_decisions", "invoices", "reminders"];

// No dashboard cap here — the full currently-actionable, ranked queue,
// same ranking definitions as the dashboard. Module-level so it's a
// stable fetchData reference for useRealtimeRefresh.
//
// includePaymentDecisions=false: this page already has its own,
// more detailed "Payment Decisions" section below (PaymentDecisionFeed)
// — including them here too would render every payment decision
// twice on this one page. Excluding them from this generic list is
// the "minimal adjustment" the shared getDecisionQueue() model needs;
// the underlying data/eligibility rules are unchanged.
async function fetchDecisionItems(): Promise<DecisionCandidate[]> {
    const queue = await getDecisionQueue(Infinity, false);
    return queue.items;
}

const KIND_STYLES: Record<
    DecisionKind,
    {
        icon: LucideIcon;
        iconColor: string;
        iconBackground: string;
        actionLabel?: string;
    }
> = {
    low_confidence: {
        icon: FileWarning,
        iconColor: tokens.status.pending.text,
        iconBackground: tokens.status.pending.background,
        actionLabel: "Mark reviewed",
    },
    payment_follow_up: {
        icon: Clock3,
        iconColor: tokens.status.info.text,
        iconBackground: tokens.status.info.background,
        actionLabel: "Mark follow-up done",
    },
    // Present only to satisfy Record<DecisionKind, ...> — this page's
    // own fetchDecisionItems() excludes payment_decision candidates
    // (see includePaymentDecisions=false above), so this entry is
    // never actually rendered here.
    payment_decision: {
        icon: Clock3,
        iconColor: tokens.status.info.text,
        iconBackground: tokens.status.info.background,
    },
};

export default function DecisionsPage() {
    const {
        data: items,
        error,
        refresh,
    } = useRealtimeRefresh<DecisionCandidate[]>(
        DECISION_TABLES,
        fetchDecisionItems
    );

    const [pendingId, setPendingId] = useState<string | null>(null);

    async function handleAction(
        id: string,
        kind: DecisionKind,
        actionId: string
    ) {
        setPendingId(id);

        try {
            if (kind === "low_confidence") {
                await markInvoiceReviewed(actionId);
            } else {
                await markReminderActioned(actionId);
            }

            await refresh();
        } catch (err) {
            console.error(err);
            toast.error("Couldn't update this item. Please try again.");
        } finally {
            setPendingId(null);
        }
    }

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
                    Decisions
                </h1>

                <p className="mt-1 text-[14px] text-[#6B645C]">
                    Every currently-actionable decision, ranked by priority.
                </p>

                <Card className="mt-6 rounded-[30px]">
                    {error ? (
                        <p className="py-8 text-center text-[14px] text-[#C96D55]">
                            Couldn&apos;t load decisions. Please try again.
                        </p>
                    ) : items === null ? (
                        <p className="py-8 text-center text-[14px] text-[#8C857C]">
                            Loading…
                        </p>
                    ) : items.length === 0 ? (
                        <p className="py-8 text-center text-[14px] text-[#8C857C]">
                            Nothing needs your attention right now.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            {items.map((decision) => {
                                const style = KIND_STYLES[decision.kind];

                                return (
                                    <DecisionItem
                                        key={decision.id}
                                        icon={style.icon}
                                        iconColor={style.iconColor}
                                        iconBackground={style.iconBackground}
                                        title={decision.title}
                                        company={decision.customerName}
                                        subtitle={decision.subtitle}
                                        reasons={
                                            decision.kind === "low_confidence"
                                                ? decision.reasons
                                                : undefined
                                        }
                                        actionLabel={style.actionLabel}
                                        actionPending={pendingId === decision.id}
                                        onAction={() =>
                                            handleAction(
                                                decision.id,
                                                decision.kind,
                                                decision.actionId
                                            )
                                        }
                                    />
                                );
                            })}
                        </div>
                    )}
                </Card>

                <PaymentDecisionFeed />
            </Page>
        </AppShell>
    );
}
