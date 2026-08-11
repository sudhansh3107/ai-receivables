"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import {
  ArrowRight,
  Banknote,
  Clock,
  Clock3,
  Eye,
  FileWarning,
  LucideIcon,
  Send,
} from "lucide-react";
import { toast } from "sonner";

import Card from "../ui/Card";
import DecisionItem, { DecisionHoverAction } from "./DecisionItem";
import { useDashboard } from "@/app/hooks/useDashboard";
import { tokens } from "@/lib/theme/tokens";
import type {
  DecisionCandidate,
  DecisionKind,
} from "@/services/server/decisionService";
import { markInvoiceReviewed } from "@/services/invoiceService";
import { markReminderActioned } from "@/services/server/reminderService";
import {
  deferPaymentDecisionRequest,
  requestPaymentProofRequest,
} from "@/lib/paymentDecisionActions";

const KIND_STYLES: Record<
  DecisionKind,
  {
    icon: LucideIcon;
    iconColor: string;
    iconBackground: string;
    // Absent for payment_decision — it uses hoverActions instead of
    // the single always-visible action button the other two kinds use.
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
  payment_decision: {
    icon: Banknote,
    iconColor: tokens.status.info.text,
    iconBackground: tokens.status.info.background,
  },
};

export default function DecisionFeed() {
  const {
    dashboard,
    loading,
    error,
    refresh,
  } = useDashboard();

  const [pendingId, setPendingId] = useState<string | null>(null);

  if (loading || error || !dashboard) {
    return null;
  }

  const { items, totalCount } = dashboard.decisionQueue;

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

  // Request-proof only: never approves, executes, or creates a payment —
  // see services/server/paymentProofRequestService.ts. Sends a
  // deterministic, same-thread Gmail reply asking the customer for
  // payment evidence; the decision is left exactly as it was (still
  // "pending") on both success and failure.
  async function handleRequestProof(
    candidateId: string,
    decisionId: string
  ) {
    setPendingId(candidateId);

    try {
      await requestPaymentProofRequest(decisionId);
      toast.success("Requested payment proof from the customer.");
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Couldn't send the proof request. Please try again."
      );
    } finally {
      setPendingId(null);
    }
  }

  // WAIT is not an approval — it only hides the decision from the queue
  // for 24 hours (services/server/paymentDecisionExecutionService.ts::
  // deferPaymentDecision()). Sends no email, creates no payment.
  // Identical handler shape to handleRequestProof above, and to
  // PaymentDecisionFeed.tsx's handleWaitPaymentDecision — the only Wait
  // implementation, reused here rather than duplicated.
  async function handleWaitPaymentDecision(
    candidateId: string,
    decisionId: string
  ) {
    setPendingId(candidateId);

    try {
      await deferPaymentDecisionRequest(decisionId);
      toast.success("Payment decision deferred for 24 hours.");
      await refresh();
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Couldn't defer this decision. Please try again."
      );
    } finally {
      setPendingId(null);
    }
  }

  // All three actions are always shown together as one consistent set.
  // A payment_decision exists because a customer's payment claim
  // couldn't be matched to the ledger — Request Proof is the action for
  // exactly that situation (asking the customer for evidence), so unlike
  // the old Approve action it is NOT gated on needsReviewReason: every
  // pending payment_decision, matched or not, is eligible (server-side
  // eligibility mirrors this — see requestPaymentProof()'s minimum
  // check of status === "pending").
  function buildHoverActions(
    decision: DecisionCandidate
  ): DecisionHoverAction[] | undefined {
    if (decision.kind !== "payment_decision") {
      return undefined;
    }

    return [
      {
        key: "requestProof",
        label: "Request Proof",
        icon: Send,
        tone: "requestProof",
        pending: pendingId === decision.id,
        ariaLabel: "Ask the customer for payment proof",
        onClick: () =>
          handleRequestProof(decision.id, decision.actionId),
      },
      {
        key: "wait",
        label: "Wait",
        icon: Clock,
        tone: "wait",
        pending: pendingId === decision.id,
        ariaLabel: "Defer this decision for later",
        onClick: () =>
          handleWaitPaymentDecision(decision.id, decision.actionId),
      },
      {
        key: "review",
        label: "Review",
        icon: Eye,
        tone: "review",
        href: "/decisions",
        ariaLabel: "Review this decision's details",
      },
    ];
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="h-full"
    >
      <Card
        className="flex h-[410px] flex-col rounded-[30px] p-0"
        style={{
          background: "#FFFFFF",
          border: "1px solid #E6DED4",
        }}
      >
        {/* Header */}

        <div className="flex items-center justify-between px-3 py-2">

          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
            Needs Your Attention
          </h2>

          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FBE8E6]">

            <span className="text-[13px] font-semibold text-[#C96D55]">
              {totalCount}
            </span>

          </div>

        </div>

        {/* Feed — top 3 prioritized decisions; totalCount above reflects
            every currently-actionable decision, not just what's shown */}

        {items.length > 0 ? (
          <div className="mt-3 flex-1 space-y-4 overflow-y-auto px-3 pb-3">

            {items.slice(0, 3).map((decision) => {
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
                  onAction={
                    decision.kind === "payment_decision"
                      ? undefined
                      : () =>
                          handleAction(
                            decision.id,
                            decision.kind,
                            decision.actionId
                          )
                  }
                  hoverActions={buildHoverActions(decision)}
                />
              );
            })}

          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center px-8 text-center">

            <p className="text-[14px] leading-6 text-[#8C857C]">
              Nothing needs your attention right now.
            </p>

          </div>
        )}

        {/* Footer */}

        <Link
          href="/decisions"
          className="
            group/link
            mt-4
            flex
            items-center
            gap-2
            px-7
            py-4
            text-[15px]
            font-semibold
            text-[#8F6B4A]
            transition-colors
            duration-200
            hover:text-[#7A5C40]
          "
        >
          View all decisions

          <ArrowRight
            size={17}
            strokeWidth={2}
            className="transition-transform duration-200 group-hover/link:translate-x-0.5"
          />

        </Link>

      </Card>
    </motion.div>
  );
}
