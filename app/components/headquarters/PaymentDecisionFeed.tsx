"use client";

import { useState } from "react";
import { Banknote, Clock, Eye, Send } from "lucide-react";
import { toast } from "sonner";

import Card from "../ui/Card";
import DecisionItem, { DecisionHoverAction } from "./DecisionItem";
import { tokens } from "@/lib/theme/tokens";
import {
    getPendingPaymentDecisions,
    PendingPaymentDecision,
} from "@/services/server/paymentDecisionService";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";
import {
    deferPaymentDecisionRequest,
    requestPaymentProofRequest,
} from "@/lib/paymentDecisionActions";
import { PAYMENT_DECISION_REVIEW_REASON_LABELS } from "@/lib/paymentDecisionReviewReasons";

const PAYMENT_DECISION_TABLES = ["payment_decisions"];

function formatCurrency(
    amount: number | null,
    currency: string | null
): string {
    if (amount == null) return "Unknown amount";

    const locale = currency === "INR" ? "en-IN" : "en-US";

    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency: currency ?? "USD",
        }).format(amount);
    } catch {
        return `${currency ?? ""} ${amount}`.trim();
    }
}

// Shown when a decision resurfaces after WAIT's 24-hour window elapsed
// with no confirmation (decision.deferredAt is non-null — see
// services/server/paymentDecisionService.ts::getPendingPaymentDecisions(),
// which only ever returns a deferred row once that window has passed).
// Wording matches the required product copy verbatim.
const WAIT_COMPLETED_CONTEXT =
    "Payment still unconfirmed — no proof received during the 24-hour wait.";

// title/subtitle wording deliberately mirrors decisionService.ts::
// buildPaymentDecisionCandidates() (Mission Control's DecisionFeed) byte
// for byte, so the same payment_decision reads identically wherever it
// appears — that consistency is the whole point of this component no
// longer maintaining its own bespoke card.
function titleFor(decision: PendingPaymentDecision): string {
    return decision.needsReviewReason
        ? "Payment needs review"
        : "Payment awaiting approval";
}

function subtitleFor(decision: PendingPaymentDecision): string {
    const amountLabel = formatCurrency(
        decision.proposedAmount,
        decision.proposedCurrency
    );

    const invoiceLabel = `Invoice ${decision.invoiceNumber ?? "unknown"}`;

    const parts = [invoiceLabel, amountLabel];

    if (decision.needsReviewReason) {
        parts.push(
            PAYMENT_DECISION_REVIEW_REASON_LABELS[
                decision.needsReviewReason
            ] ?? decision.needsReviewReason
        );
    }

    if (decision.deferredAt) {
        parts.push(WAIT_COMPLETED_CONTEXT);
    }

    return parts.join(" · ");
}

// Distinct from DecisionFeed/DecisionItem's low_confidence/
// payment_follow_up kinds: this renders payment_decisions rows — an
// unresolved payment CLAIM (see paymentEmailMatchingService.ts), not a
// routine review/follow-up task. Shared as-is between the /decisions page
// and the Mission Control homepage (DecisionFeed) so there is exactly one
// set of human actions for a payment_decision, not two:
//
//   REQUEST PROOF | WAIT | REVIEW
//
// A payment_decision is never "approved" here or anywhere — see
// services/server/paymentProofRequestService.ts and
// services/server/paymentDecisionExecutionService.ts::approvePaymentDecision()'s
// own docs for why that verb no longer applies to this action set.
//
// Renders each decision via the EXISTING DecisionItem component and its
// hover-action overlay (the same one Mission Control uses) rather than a
// bespoke card, so the interaction — icons, tone tokens, hover/focus
// behavior, card dimensions — is identical everywhere a payment_decision
// is shown, not just similar.
export default function PaymentDecisionFeed() {
    const {
        data: decisions,
        error,
        refresh,
    } = useRealtimeRefresh<PendingPaymentDecision[]>(
        PAYMENT_DECISION_TABLES,
        getPendingPaymentDecisions
    );

    const [pendingId, setPendingId] = useState<string | null>(null);

    if (error || decisions === null || decisions.length === 0) {
        return null;
    }

    // Request-proof only: never approves, executes, or creates a payment
    // — see services/server/paymentProofRequestService.ts. Sends a
    // deterministic, same-thread Gmail reply asking the customer for
    // payment evidence; the decision is left exactly as it was (still
    // "pending") on both success and failure. Identical wrapper call and
    // handler shape to DecisionFeed.tsx's handleRequestProof — the only
    // Request Proof implementation, reused here rather than duplicated.
    async function handleRequestProof(decisionId: string) {
        setPendingId(decisionId);

        try {
            await requestPaymentProofRequest(decisionId);

            toast.success("Requested payment proof from the customer.");

            // Immediate feedback — the existing payment_decisions
            // Realtime subscription above will also independently
            // reflect any change (here and in any other mounted
            // instance of this component); this just avoids waiting on
            // the debounce for the card that was just acted on. Request
            // Proof itself never changes payment_decisions, so this is
            // largely a no-op refresh today, kept for consistency with
            // DecisionFeed.tsx's identical pattern.
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

    // WAIT is not an approval — it only hides the decision from the
    // queue for 24 hours (services/server/paymentDecisionExecutionService.ts::
    // deferPaymentDecision()). Sends no email, creates no payment.
    // Identical handler shape to handleRequestProof above, and to
    // DecisionFeed.tsx's handleWaitPaymentDecision — the only Wait
    // implementation, reused here rather than duplicated.
    async function handleWaitPaymentDecision(decisionId: string) {
        setPendingId(decisionId);

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

    function buildHoverActions(
        decision: PendingPaymentDecision
    ): DecisionHoverAction[] {
        return [
            {
                key: "requestProof",
                label: "Request Proof",
                icon: Send,
                tone: "requestProof",
                pending: pendingId === decision.id,
                ariaLabel: "Ask the customer for payment proof",
                onClick: () => handleRequestProof(decision.id),
            },
            {
                key: "wait",
                label: "Wait",
                icon: Clock,
                tone: "wait",
                pending: pendingId === decision.id,
                ariaLabel: "Defer this decision for later",
                onClick: () => handleWaitPaymentDecision(decision.id),
            },
            {
                key: "review",
                label: "Review",
                icon: Eye,
                tone: "review",
                // No href: unlike Mission Control (which links here, to
                // /decisions), this component IS /decisions' own detailed
                // view of this same decision — navigating to itself would
                // be a pointless self-link. Kept visible-but-inert so the
                // same three-action set appears everywhere a
                // payment_decision is rendered, per the product rule.
                disabled: true,
                ariaLabel: "You're already viewing this decision's details",
            },
        ];
    }

    return (
        <Card className="mt-6 rounded-[30px]">
            <div className="flex items-center justify-between px-3 py-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                        Payment Decisions
                    </h2>

                    <p className="mt-1 text-[13px] text-[#6B645C]">
                        Payments AI matched from email that couldn&apos;t be
                        reconciled — separate from invoice/reminder
                        decisions.
                    </p>
                </div>

                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E7F0FA]">
                    <span className="text-[13px] font-semibold text-[#4F79B8]">
                        {decisions.length}
                    </span>
                </div>
            </div>

            <div className="mt-3 space-y-4 px-3 pb-3">
                {decisions.map((decision) => (
                    <DecisionItem
                        key={decision.id}
                        icon={Banknote}
                        iconColor={tokens.status.info.text}
                        iconBackground={tokens.status.info.background}
                        title={titleFor(decision)}
                        company={decision.customerName ?? "Unknown customer"}
                        subtitle={subtitleFor(decision)}
                        hoverActions={buildHoverActions(decision)}
                    />
                ))}
            </div>
        </Card>
    );
}
