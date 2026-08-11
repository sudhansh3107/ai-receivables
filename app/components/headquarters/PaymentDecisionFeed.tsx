"use client";

import Card from "../ui/Card";
import { tokens } from "@/lib/theme/tokens";
import {
    getPendingPaymentDecisions,
    PendingPaymentDecision,
} from "@/services/server/paymentDecisionService";
import { useRealtimeRefresh } from "../../hooks/useRealtimeRefresh";

const PAYMENT_DECISION_TABLES = ["payment_decisions"];

const REVIEW_REASON_LABELS: Record<string, string> = {
    customer_not_found: "Customer not found",
    payment_facts_incomplete: "Missing payment details",
    low_extraction_confidence: "Low extraction confidence",
    invoice_not_found: "Invoice not found",
    currency_mismatch: "Currency mismatch",
    invalid_amount: "Invalid amount",
    overpayment: "Overpayment",
};

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

function formatConfidence(confidence: number | null): string {
    if (confidence == null) return "Unknown";
    return `${Math.round(confidence * 100)}%`;
}

// Distinct from DecisionFeed/DecisionItem (low_confidence /
// payment_follow_up): this renders payment_decisions rows, a
// different kind of decision — a proposed money-moving action awaiting
// human approval, not a routine review/follow-up task. Read-only: no
// approve/reject/execute action is wired here. The existing endpoints
// (POST /api/payment-decisions/[id]/approve and .../execute) are
// wired up separately once this display is confirmed correct.
export default function PaymentDecisionFeed() {
    const { data: decisions, error } = useRealtimeRefresh<
        PendingPaymentDecision[]
    >(PAYMENT_DECISION_TABLES, getPendingPaymentDecisions);

    if (error || decisions === null || decisions.length === 0) {
        return null;
    }

    return (
        <Card className="mt-6 rounded-[30px]">
            <div className="flex items-center justify-between px-3 py-2">
                <div>
                    <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[#1A1A1A]">
                        Payment Decisions
                    </h2>

                    <p className="mt-1 text-[13px] text-[#6B645C]">
                        Payments AI matched from email, awaiting approval —
                        separate from invoice/reminder decisions.
                    </p>
                </div>

                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#E7F0FA]">
                    <span className="text-[13px] font-semibold text-[#4F79B8]">
                        {decisions.length}
                    </span>
                </div>
            </div>

            <div className="mt-3 space-y-4 px-3 pb-3">
                {decisions.map((decision) => {
                    const isIncomplete =
                        decision.needsReviewReason ===
                        "payment_facts_incomplete";

                    return (
                        <div
                            key={decision.id}
                            className="rounded-2xl border border-[#ECE4DA] bg-[#FCFAF7] p-5"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div>
                                    <p className="text-[14px] font-semibold text-[#1A1A1A]">
                                        {decision.customerName ??
                                            "Unknown customer"}
                                    </p>

                                    <p className="mt-1 text-[13px] text-[#6B645C]">
                                        Invoice{" "}
                                        {decision.invoiceNumber ?? "unknown"}
                                    </p>
                                </div>

                                <p className="text-[15px] font-semibold text-[#1A1A1A]">
                                    {formatCurrency(
                                        decision.proposedAmount,
                                        decision.proposedCurrency
                                    )}
                                </p>
                            </div>

                            <div className="mt-3 flex flex-wrap items-center gap-2">
                                <span
                                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                    style={{
                                        background:
                                            tokens.status.pending.background,
                                        color: tokens.status.pending.text,
                                    }}
                                >
                                    Status: {decision.status}
                                </span>

                                <span
                                    className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                                    style={{
                                        background:
                                            tokens.status.info.background,
                                        color: tokens.status.info.text,
                                    }}
                                >
                                    Execution:{" "}
                                    {decision.executionStatus.replace(
                                        /_/g,
                                        " "
                                    )}
                                </span>

                                <span className="text-[11px] text-[#8C857C]">
                                    Confidence:{" "}
                                    {formatConfidence(
                                        decision.extractionConfidence
                                    )}
                                </span>
                            </div>

                            {decision.needsReviewReason && (
                                <p
                                    className="mt-3 rounded-xl px-3 py-2 text-[12px] leading-[17px]"
                                    style={{
                                        background:
                                            tokens.status.overdue.background,
                                        color: tokens.status.overdue.text,
                                    }}
                                >
                                    {isIncomplete
                                        ? "Missing payment details (e.g. payment date) — cannot be safely approved yet."
                                        : REVIEW_REASON_LABELS[
                                              decision.needsReviewReason
                                          ] ?? decision.needsReviewReason}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
