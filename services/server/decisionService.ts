import { supabase } from "@/lib/supabase";

import {
    getInvoicesNeedingReviewDetails,
    InvoiceNeedingReview,
} from "@/services/invoiceService";

import {
    getRemindersNeedingAttention,
    ReminderNeedingAttention,
} from "./reminderService";

import {
    getPendingPaymentDecisions,
    PendingPaymentDecision,
} from "./paymentDecisionService";

import {
    getEscalatedCollectionCases,
    EscalatedCollectionCase,
} from "./collectionCaseService";

import { PAYMENT_DECISION_REVIEW_REASON_LABELS } from "@/lib/paymentDecisionReviewReasons";

// An overdue invoice needing follow-up is represented by its reminder
// (every invoice gets exactly one reminder, scheduled at its due
// date), so tracking both would double-count the same real-world work
// item — low_confidence/payment_follow_up remain the only two
// countable review/follow-up types. payment_decision is a distinct
// third kind: a proposed money-moving action awaiting human approval,
// not a routine review/follow-up task. collection_escalation
// (Responsibility #3) is a fourth, distinct kind: a collection case the
// employee could not safely continue autonomously — see
// services/server/collectionDecisionEngine.ts's canonical escalation
// gate for exactly when this fires.
export type DecisionKind =
    | "low_confidence"
    | "payment_follow_up"
    | "payment_decision"
    | "collection_escalation";

export interface DecisionCandidate {
    id: string;
    kind: DecisionKind;
    actionId: string;
    customerName: string;
    title: string;
    subtitle: string;
    reasons: string[] | null;

    // Only meaningful for kind === "payment_decision" — null means the
    // matcher classified this as "ready" (no review needed); any
    // other value is the existing needs_review_reason verbatim.
    needsReviewReason?: string | null;
}

// The dashboard shows a bounded, prioritized slice; the badge/count
// must reflect the true, uncapped size of the actionable queue.
// `items.length` is never a valid substitute for `totalCount`.
export interface DecisionQueue {
    items: DecisionCandidate[];
    totalCount: number;
}

function formatCurrency(amount: number, currency: string) {
    const locale = currency === "INR" ? "en-IN" : "en-US";

    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
    }).format(amount);
}

function formatShortDate(dateString: string) {
    return new Date(dateString).toLocaleDateString("en-IN", {
        month: "short",
        day: "numeric",
    });
}

// Whole calendar days between `scheduledAt`'s local date and today's
// local date. Never negative — getRemindersNeedingAttention already
// filters to scheduled_at <= now(), so every candidate is due today
// or overdue, never in the future.
function daysOverdue(scheduledAt: string): number {
    const scheduled = new Date(scheduledAt);
    scheduled.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = today.getTime() - scheduled.getTime();
    return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

// customer_insights.risk_level, ranked so a lower number is higher
// priority. "insufficient_history"/"limited_history" and a missing
// row are all treated as the same neutral middle rank — never as
// high risk (which would overstate urgency) and never as low risk
// (which would understate it).
const RISK_RANK: Record<string, number> = {
    high: 0,
    moderate: 1,
    insufficient_history: 2,
    limited_history: 2,
    unknown: 2,
    low: 3,
};

const NEUTRAL_RISK_RANK = RISK_RANK.unknown;

function riskRankFor(riskLevel: string | null | undefined): number {
    if (!riskLevel) return NEUTRAL_RISK_RANK;
    return RISK_RANK[riskLevel] ?? NEUTRAL_RISK_RANK;
}

// Batch-fetches risk_level for a set of customer IDs in a single
// query (never per-candidate) — a missing row simply means the
// customer has no entry in the map, and callers must fall back to
// the neutral rank rather than dropping the candidate.
async function getRiskRankByCustomer(
    customerIds: string[]
): Promise<Map<string, number>> {
    const uniqueIds = Array.from(new Set(customerIds));

    if (uniqueIds.length === 0) {
        return new Map();
    }

    const { data, error } = await supabase
        .from("customer_insights")
        .select("customer_id, risk_level")
        .in("customer_id", uniqueIds);

    if (error) throw error;

    const map = new Map<string, number>();

    for (const row of data ?? []) {
        map.set(row.customer_id, riskRankFor(row.risk_level));
    }

    return map;
}

// Deterministic priority tuple, compared lexicographically (earlier
// fields dominate later ones). Every value is oriented so a SMALLER
// number sorts first (= higher priority):
//
//   1. kindTier        0 = payment decision, 1 = collection escalation,
//                      2 = overdue follow-up, 3 = due-today follow-up,
//                      4 = low-confidence review. A pending payment
//                      decision represents money that has already
//                      arrived and only needs a human nod — it
//                      outranks everything else. A collection
//                      escalation represents accumulated evidence that
//                      the employee could not safely continue
//                      autonomously — more urgent than a routine
//                      unactioned reminder, but a customer's claimed
//                      payment still ranks above it. (Renumbered from
//                      the original 0/1/2/3 scheme when
//                      collection_escalation was introduced —
//                      Responsibility #3.)
//   2. -daysOverdue     more overdue sorts first (0 for review/
//                       payment-decision items)
//   3. -amountAtRisk    balance_due (follow-up) / invoice_amount
//                       (review) / proposed_amount (payment decision)
//                       — larger amount sorts first
//   4. riskRank         customer_insights.risk_level, high(0)..low(3);
//                       neutral (2) when unavailable
//   5. -reminderStage   a reminder ignored through more stages sorts
//                       first (0 for review/payment-decision items)
//   6. ageTiebreakMs    epoch ms of scheduled_at/created_at — the
//                       older item sorts first, guaranteeing a total
//                       order so no two candidates can tie
//
// Any two candidates can be explained by pointing at the first tuple
// index where they differ.
type PriorityTuple = [number, number, number, number, number, number];

interface RankedCandidate {
    candidate: DecisionCandidate;
    tuple: PriorityTuple;
}

function buildLowConfidenceCandidates(
    invoices: InvoiceNeedingReview[],
    riskByCustomer: Map<string, number>
): RankedCandidate[] {
    return invoices.map((invoice) => ({
        candidate: {
            id: `low_confidence:${invoice.id}`,
            kind: "low_confidence",
            actionId: invoice.id,
            customerName: invoice.customerName,
            title: "Low-confidence extraction",
            subtitle: `Invoice ${invoice.invoiceNumber} · ${formatCurrency(
                invoice.amount,
                invoice.currency
            )}`,
            reasons: invoice.confidenceReasons,
        },
        tuple: [
            4,
            0,
            -invoice.amount,
            riskByCustomer.get(invoice.customerId) ?? NEUTRAL_RISK_RANK,
            0,
            new Date(invoice.createdAt).getTime(),
        ],
    }));
}

function buildPaymentFollowUpCandidates(
    reminders: ReminderNeedingAttention[],
    riskByCustomer: Map<string, number>
): RankedCandidate[] {
    return reminders.map((reminder) => {
        const overdueDays = daysOverdue(reminder.scheduledAt);
        const isOverdue = overdueDays > 0;

        return {
            candidate: {
                id: `payment_follow_up:${reminder.id}`,
                kind: "payment_follow_up",
                actionId: reminder.id,
                customerName: reminder.customerName,
                title: isOverdue
                    ? "Follow-up overdue"
                    : "Follow-up due today",
                subtitle: `Invoice ${reminder.invoiceNumber} · Stage ${
                    reminder.reminderStage
                } ${reminder.channel} · ${formatShortDate(
                    reminder.scheduledAt
                )}`,
                reasons: null,
            },
            tuple: [
                isOverdue ? 2 : 3,
                -overdueDays,
                -reminder.balanceDue,
                riskByCustomer.get(reminder.customerId) ?? NEUTRAL_RISK_RANK,
                -reminder.reminderStage,
                new Date(reminder.scheduledAt).getTime(),
            ],
        };
    });
}

// Shown when a decision resurfaces after WAIT's 24-hour window elapsed
// with no confirmation (decision.deferredAt is non-null — see
// paymentDecisionService.ts::getPendingPaymentDecisions(), which only
// ever returns a deferred row once that window has passed). Wording
// matches the required product copy verbatim, and matches
// PaymentDecisionFeed.tsx's identical constant byte for byte so a
// payment_decision reads identically everywhere it appears.
const WAIT_COMPLETED_CONTEXT =
    "Payment still unconfirmed — no proof received during the 24-hour wait.";

// subtitle intentionally embeds the review-reason label directly (not
// via DecisionCandidate.reasons, whose rendering in DecisionItem is
// hardcoded to low_confidence's "What I confirmed" / "based on low
// confidence" framing — reusing it for a payment decision's review
// reason would misrepresent it) so a needs-review payment decision is
// clearly identifiable at a glance without touching DecisionItem's
// existing low_confidence rendering path at all.
function buildPaymentDecisionCandidates(
    decisions: PendingPaymentDecision[],
    riskByCustomer: Map<string, number>
): RankedCandidate[] {
    return decisions.map((decision) => {
        const amountLabel =
            decision.proposedAmount == null
                ? "Unknown amount"
                : formatCurrency(
                      decision.proposedAmount,
                      decision.proposedCurrency ?? "INR"
                  );

        const reviewReasonLabel = decision.needsReviewReason
            ? PAYMENT_DECISION_REVIEW_REASON_LABELS[
                  decision.needsReviewReason
              ] ?? decision.needsReviewReason
            : null;

        const subtitleParts = [
            `Invoice ${decision.invoiceNumber ?? "unknown"}`,
            amountLabel,
        ];

        if (reviewReasonLabel) {
            subtitleParts.push(reviewReasonLabel);
        }

        if (decision.deferredAt) {
            subtitleParts.push(WAIT_COMPLETED_CONTEXT);
        }

        return {
            candidate: {
                id: `payment_decision:${decision.id}`,
                kind: "payment_decision",
                actionId: decision.id,
                customerName: decision.customerName ?? "Unknown customer",
                title: reviewReasonLabel
                    ? "Payment needs review"
                    : "Payment awaiting approval",
                subtitle: subtitleParts.join(" · "),
                reasons: null,
                needsReviewReason: decision.needsReviewReason,
            },
            tuple: [
                0,
                0,
                -(decision.proposedAmount ?? 0),
                decision.customerId
                    ? riskByCustomer.get(decision.customerId) ??
                      NEUTRAL_RISK_RANK
                    : NEUTRAL_RISK_RANK,
                0,
                new Date(decision.createdAt).getTime(),
            ],
        };
    });
}

// A collection case the employee escalated because the canonical
// escalation gate (collectionDecisionEngine.ts::computeEscalationGate())
// was satisfied — see that file for exactly when. subtitle surfaces the
// deterministic escalation_reason sentence directly (never raw
// evidence fields) plus a compact history summary, so a human can act
// without reconstructing the case from scratch.
function buildCollectionEscalationCandidates(
    cases: EscalatedCollectionCase[],
    riskByCustomer: Map<string, number>
): RankedCandidate[] {
    return cases.map((collectionCase) => {
        const subtitleParts = [
            `${collectionCase.outreachCount} outreach attempt${
                collectionCase.outreachCount === 1 ? "" : "s"
            }`,
        ];

        if (collectionCase.brokenPromiseCount > 0) {
            subtitleParts.push(
                `${collectionCase.brokenPromiseCount} broken promise${
                    collectionCase.brokenPromiseCount === 1 ? "" : "s"
                }`
            );
        }

        if (collectionCase.exceptionType) {
            subtitleParts.push(
                collectionCase.exceptionType.replace(/_/g, " ")
            );
        }

        return {
            candidate: {
                id: `collection_escalation:${collectionCase.id}`,
                kind: "collection_escalation",
                actionId: collectionCase.id,
                customerName: collectionCase.customerName ?? "Unknown customer",
                title: "Collection case needs review",
                subtitle: subtitleParts.join(" · "),
                reasons: collectionCase.escalationReason
                    ? [collectionCase.escalationReason]
                    : null,
            },
            tuple: [
                1,
                0,
                0,
                riskByCustomer.get(collectionCase.customerId) ??
                    NEUTRAL_RISK_RANK,
                0,
                collectionCase.escalatedAt
                    ? new Date(collectionCase.escalatedAt).getTime()
                    : 0,
            ],
        };
    });
}

function compareTuples(a: PriorityTuple, b: PriorityTuple): number {
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

// Fetches the FULL actionable candidate set (never a pre-truncated
// "N per kind" slice — a high-priority item outside an arbitrary
// first-N would otherwise never be seen), ranks it deterministically,
// and returns only the top `topN` for display alongside the true
// uncapped total. `topN` may be Infinity (e.g. the /decisions page)
// to return every candidate as `items`.
//
// `includePaymentDecisions` defaults to true (Mission Control's
// DecisionFeed needs payment decisions folded into this same queue —
// that's the whole point of this parameter existing). /decisions
// passes false for its own generic list specifically because that
// page already has a separate, more detailed "Payment Decisions"
// section (PaymentDecisionFeed) — without this, payment decisions
// would render twice on that one page. This is the "minimal
// adjustment" the shared model needs, not new business logic: the
// underlying data/ranking/eligibility rules are identical either way.
export async function getDecisionQueue(
    topN = 3,
    includePaymentDecisions = true,
    includeCollectionEscalations = true
): Promise<DecisionQueue> {
    const [invoices, reminders, paymentDecisions, collectionCases] =
        await Promise.all([
            getInvoicesNeedingReviewDetails(),
            getRemindersNeedingAttention(),
            includePaymentDecisions
                ? getPendingPaymentDecisions()
                : Promise.resolve([]),
            includeCollectionEscalations
                ? getEscalatedCollectionCases()
                : Promise.resolve([]),
        ]);

    const riskByCustomer = await getRiskRankByCustomer([
        ...invoices.map((invoice) => invoice.customerId),
        ...reminders.map((reminder) => reminder.customerId),
        ...paymentDecisions
            .map((decision) => decision.customerId)
            .filter((id): id is string => id !== null),
        ...collectionCases.map((collectionCase) => collectionCase.customerId),
    ]);

    const ranked = [
        ...buildLowConfidenceCandidates(invoices, riskByCustomer),
        ...buildPaymentFollowUpCandidates(reminders, riskByCustomer),
        ...buildPaymentDecisionCandidates(paymentDecisions, riskByCustomer),
        ...buildCollectionEscalationCandidates(
            collectionCases,
            riskByCustomer
        ),
    ].sort((a, b) => compareTuples(a.tuple, b.tuple));

    return {
        items: ranked.slice(0, topN).map((entry) => entry.candidate),
        totalCount: ranked.length,
    };
}
