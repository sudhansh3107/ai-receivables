import { supabase } from "@/lib/supabase";

import {
    getInvoicesNeedingReviewDetails,
    InvoiceNeedingReview,
} from "@/services/invoiceService";

import {
    getRemindersNeedingAttention,
    ReminderNeedingAttention,
} from "./reminderService";

// Only two countable action types, matching MissionCard's action
// semantics exactly — there is no independent "overdue invoice"
// candidate. An overdue invoice needing follow-up is represented by
// its reminder (every invoice gets exactly one reminder, scheduled
// at its due date), so tracking both would double-count the same
// real-world work item.
export type DecisionKind = "low_confidence" | "payment_follow_up";

export interface DecisionCandidate {
    id: string;
    kind: DecisionKind;
    actionId: string;
    customerName: string;
    title: string;
    subtitle: string;
    reasons: string[] | null;
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
//   1. kindTier        0 = overdue follow-up, 1 = due-today
//                      follow-up, 2 = low-confidence review.
//                      Payment follow-up always outranks review —
//                      it represents unresolved cash collection.
//   2. -daysOverdue     more overdue sorts first (0 for review items)
//   3. -amountAtRisk    balance_due (follow-up) / invoice_amount
//                       (review) — larger amount sorts first
//   4. riskRank         customer_insights.risk_level, high(0)..low(3);
//                       neutral (2) when unavailable
//   5. -reminderStage   a reminder ignored through more stages sorts
//                       first (0 for review items)
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
            2,
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
                isOverdue ? 0 : 1,
                -overdueDays,
                -reminder.balanceDue,
                riskByCustomer.get(reminder.customerId) ?? NEUTRAL_RISK_RANK,
                -reminder.reminderStage,
                new Date(reminder.scheduledAt).getTime(),
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
export async function getDecisionQueue(topN = 3): Promise<DecisionQueue> {
    const [invoices, reminders] = await Promise.all([
        getInvoicesNeedingReviewDetails(),
        getRemindersNeedingAttention(),
    ]);

    const riskByCustomer = await getRiskRankByCustomer([
        ...invoices.map((invoice) => invoice.customerId),
        ...reminders.map((reminder) => reminder.customerId),
    ]);

    const ranked = [
        ...buildLowConfidenceCandidates(invoices, riskByCustomer),
        ...buildPaymentFollowUpCandidates(reminders, riskByCustomer),
    ].sort((a, b) => compareTuples(a.tuple, b.tuple));

    return {
        items: ranked.slice(0, topN).map((entry) => entry.candidate),
        totalCount: ranked.length,
    };
}
