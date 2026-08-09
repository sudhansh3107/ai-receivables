"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clock3, FileWarning, LucideIcon } from "lucide-react";
import { toast } from "sonner";

import AppShell from "../components/layout/AppShell";
import Page from "../components/ui/Page";
import Card from "../components/ui/Card";
import DecisionItem from "../components/headquarters/DecisionItem";
import { tokens } from "@/lib/theme/tokens";

import {
    getDecisionQueue,
    DecisionKind,
    DecisionCandidate,
} from "@/services/server/decisionService";
import { markInvoiceReviewed } from "@/services/invoiceService";
import { markReminderActioned } from "@/services/server/reminderService";

const KIND_STYLES: Record<
    DecisionKind,
    {
        icon: LucideIcon;
        iconColor: string;
        iconBackground: string;
        actionLabel: string;
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
};

export default function DecisionsPage() {
    const [items, setItems] = useState<DecisionCandidate[] | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [pendingId, setPendingId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            // No dashboard cap here — the full currently-actionable,
            // ranked queue, same ranking definitions as the dashboard.
            const queue = await getDecisionQueue(Infinity);
            setItems(queue.items);
            setError(null);
        } catch (err) {
            setError(err as Error);
        }
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

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

            await load();
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
            </Page>
        </AppShell>
    );
}
