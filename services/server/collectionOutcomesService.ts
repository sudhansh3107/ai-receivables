import { supabase } from "@/lib/supabase";
import { ActivityTypes } from "@/lib/activityTypes";

// ---------------------------------------------------------------------
// Responsibility #10 (Learn From Collection Outcomes) — MVP scope.
//
// This file is a deterministic, READ-ONLY reporting layer over data
// Responsibilities #3-#9 already durably capture. It computes fixed,
// human-defined metrics from historical fact; it does not fit a model,
// does not learn weights, and does not adapt any behavior.
//
// It is intentionally NOT wired into anything the decision engine
// consumes. collectionDecisionEngine.ts, computeEscalationGate(), and
// customerInsightService.ts are untouched by this file and never import
// from it. This is a one-way read: production state -> this file. There
// is no path from this file back into production state. That boundary
// is deliberate — see each function's own header for why a feedback
// loop here would be dangerous (the system would be scoring itself
// against its own unlabelled outcomes, with no human confirmation that
// a given outcome was actually GOOD).
//
// Two source-of-truth roles, used consistently throughout this file:
//   - collection_cases  = CURRENT/lifecycle state. Reliable for facts
//     that are genuinely terminal and never revised once set (a case's
//     own closed_at/closed_reason; case-level opened_at). NOT reliable
//     for anything that can happen more than once per case (promises,
//     exceptions, escalations all cycle — see Responsibility #6/#7/#9)
//     since the row only ever reflects the LATEST cycle.
//   - activity_log      = historical evidence. The only durable record
//     of every past cycle. Every collection-relevant row carries
//     metadata.caseId (established throughout #3-#9), which is what
//     every function below groups on — this is also what makes a
//     reopened customer's case #1 and case #2 naturally separate here:
//     they have different case IDs, so they are different groups, with
//     no special-casing required.
//
// No new tables, columns, or migrations. No mutable analytics snapshot
// is maintained — every metric is recomputed on read from the existing
// durable tables.
// ---------------------------------------------------------------------

// MVP safety cap on how much activity_log history a single metric call
// scans — a documented limit, not a claim of unlimited history, same
// convention as activityLogService.ts::getActivityHistory() and
// collectionCaseService.ts::getCollectionCaseList(). Generous enough
// for this project's actual data volume; revisit if the dataset grows
// enough for this to matter.
const HISTORY_SCAN_LIMIT = 5000;

// ---------------------------------------------------------------------
// Shared result shapes — every rate/duration exposes its denominator
// alongside the computed value, never a bare percentage/average with
// no visible sample size.
// ---------------------------------------------------------------------

export interface RateMetric {
    numerator: number;
    denominator: number;
    // null (never NaN/0) when denominator is 0 — "no data" is not the
    // same fact as "0%", and callers must be able to tell them apart.
    rate: number | null;
}

export interface DurationMetric {
    qualifyingCount: number;
    averageDurationHours: number | null;
    // Sum of all qualifying durations, in hours — present alongside the
    // average purely for auditability (lets a caller cross-check
    // average * count against an independently-visible total).
    totalDurationHours: number | null;
}

function toRate(numerator: number, denominator: number): RateMetric {
    return {
        numerator,
        denominator,
        rate: denominator > 0 ? numerator / denominator : null,
    };
}

function toDurationMetric(durationsHours: number[]): DurationMetric {
    if (durationsHours.length === 0) {
        return { qualifyingCount: 0, averageDurationHours: null, totalDurationHours: null };
    }

    const total = durationsHours.reduce((sum, hours) => sum + hours, 0);

    return {
        qualifyingCount: durationsHours.length,
        averageDurationHours: total / durationsHours.length,
        totalDurationHours: total,
    };
}

function hoursBetween(earlier: string, later: string): number {
    return (new Date(later).getTime() - new Date(earlier).getTime()) / (1000 * 60 * 60);
}

interface ActivityRow {
    id: string;
    activity_type: string;
    metadata: Record<string, unknown> | null;
    created_at: string;
}

async function fetchActivity(activityTypes: string[]): Promise<ActivityRow[]> {
    const { data, error } = await supabase
        .from("activity_log")
        .select("id, activity_type, metadata, created_at")
        .in("activity_type", activityTypes)
        .order("created_at", { ascending: true })
        .limit(HISTORY_SCAN_LIMIT);

    if (error) throw error;

    return (data ?? []) as ActivityRow[];
}

// Groups activity rows by metadata.caseId — the per-case reconstruction
// key used throughout this file. A row missing caseId is defensively
// dropped (should not happen given every collection_* logActivity()
// call site already includes it, but this file only ever reads, so it
// degrades safely rather than crashing on an unexpected row shape).
function groupByCaseId(rows: ActivityRow[]): Map<string, ActivityRow[]> {
    const byCaseId = new Map<string, ActivityRow[]>();

    for (const row of rows) {
        const caseId = row.metadata?.caseId;
        if (typeof caseId !== "string") continue;

        const existing = byCaseId.get(caseId) ?? [];
        existing.push(row);
        byCaseId.set(caseId, existing);
    }

    return byCaseId;
}

// =========================================================================
// 1. CASE RESOLUTION BREAKDOWN
// =========================================================================
//
// Source: collection_cases current state (status/closed_reason), NOT
// activity_log. This is the one metric in this file where reading the
// current row is correct rather than a shortcut: resolution is a
// genuinely terminal, one-time fact per case (see collectionCaseService.ts
// — every path that sets status='resolved' is a one-way conditional
// UPDATE keyed on the case NOT already being resolved; nothing in the
// codebase ever un-resolves a case or changes closed_reason afterward).
// Unlike promise_status/exception_status/escalated_at, there is no
// "which cycle" ambiguity to reconstruct here.

export interface CaseResolutionBreakdown {
    totalResolved: number;
    resolvedPaid: RateMetric;
    resolvedNoExposure: RateMetric;
    resolvedManual: RateMetric;
}

export async function getCaseResolutionBreakdown(): Promise<CaseResolutionBreakdown> {
    const { data, error } = await supabase
        .from("collection_cases")
        .select("closed_reason")
        .eq("status", "resolved")
        .limit(HISTORY_SCAN_LIMIT);

    if (error) throw error;

    const rows = (data ?? []) as { closed_reason: string | null }[];
    const totalResolved = rows.length;

    const countOf = (reason: string) =>
        rows.filter((row) => row.closed_reason === reason).length;

    return {
        totalResolved,
        resolvedPaid: toRate(countOf("resolved_paid"), totalResolved),
        resolvedNoExposure: toRate(countOf("resolved_no_exposure"), totalResolved),
        resolvedManual: toRate(countOf("resolved_manual"), totalResolved),
    };
}

// =========================================================================
// 2. PROMISE RELIABILITY
// =========================================================================
//
// Source: activity_log, counting ONLY the three VERDICT activity types —
// collection_promise_fulfilled / _partially_fulfilled / _broken. This is
// the entire double-counting-avoidance mechanism, and it is sufficient
// on its own:
//
//   - collection_promise_acknowledged and collection_promise_revised are
//     a promise being MADE or RE-MADE, never a promise reaching a
//     verdict — they are deliberately excluded from this count entirely.
//     A revised promise's PRIOR commitment never independently earns a
//     broken/fulfilled/partial row of its own (see the R6 dispatch —
//     collectionDecisionEngine.ts's T4 branch only ever logs ONE of
//     acknowledged/revised per response, never also a verdict for what
//     it superseded), so counting verdict rows can never double-count a
//     revision as an extra outcome.
//   - Each individual promise INSTANCE can reach a verdict at most once:
//     buildPromiseOutcome() always moves the case's status OUT of
//     'promise_to_pay' the moment it assigns a verdict (newStatus is
//     always 'awaiting_response'), so that same promise instance can
//     never re-enter the promise_to_pay branch and be re-judged. A case
//     CAN go on to make a second, later promise (a genuinely distinct
//     instance) that earns its own, independent verdict — that is
//     correctly counted as a second data point, not a duplicate.
//
// Deliberate scope decision: this does NOT count a still-"partial"
// promise as retroactively "fulfilled" merely because the case later
// resolves in full via an unrelated payment event (Responsibility #3's
// universal resolution gate can flip a stale promise_status straight to
// 'kept' as a side effect of resolving the whole case). That transition
// never emits its own collection_promise_fulfilled row — the resolve
// path only ever logs collection_case_resolved — so there is no durable,
// per-promise evidence to attribute to a specific promise instance here.
// That event is already captured correctly by
// getCaseResolutionBreakdown() above (as a resolved_paid case); it is
// intentionally not double-counted here as a second, promise-level
// "fulfilled" outcome.

export interface PromiseReliability {
    totalVerdicts: number;
    fulfilled: RateMetric;
    partiallyFulfilled: RateMetric;
    broken: RateMetric;
}

export async function getPromiseReliability(): Promise<PromiseReliability> {
    const rows = await fetchActivity([
        ActivityTypes.COLLECTION_PROMISE_FULFILLED,
        ActivityTypes.COLLECTION_PROMISE_PARTIALLY_FULFILLED,
        ActivityTypes.COLLECTION_PROMISE_BROKEN,
    ]);

    const totalVerdicts = rows.length;
    const countOf = (type: string) => rows.filter((row) => row.activity_type === type).length;

    return {
        totalVerdicts,
        fulfilled: toRate(countOf(ActivityTypes.COLLECTION_PROMISE_FULFILLED), totalVerdicts),
        partiallyFulfilled: toRate(
            countOf(ActivityTypes.COLLECTION_PROMISE_PARTIALLY_FULFILLED),
            totalVerdicts
        ),
        broken: toRate(countOf(ActivityTypes.COLLECTION_PROMISE_BROKEN), totalVerdicts),
    };
}

// =========================================================================
// 3. EXCEPTION RESOLUTION SPEED
// =========================================================================
//
// Source: activity_log, reconstructing EPISODES per case rather than
// trusting the current row's single exception_opened_at (which only
// ever reflects the latest episode — see Responsibility #7/#8's own
// "sticky exception_category" behavior). A case can have multiple
// exception episodes over its life (a blocker that resolves, followed
// much later by an unrelated dispute); each is a separate, independent
// data point here.
//
// Episode-pairing algorithm, walking each case's exception-activity
// rows in chronological order with at most one "currently open episode"
// tracked at a time (mirroring collection_cases' own single-slot
// exception_* design):
//   - collection_dispute_opened / collection_blocker_opened always
//     START a fresh episode (category + this row's created_at as the
//     open timestamp) — this includes a dispute superseding an
//     already-open blocker (Responsibility #7's T6 branch logs that
//     specific case as *_opened, not *_revised, precisely because it is
//     a genuine category change with its own fresh clock). If a
//     DIFFERENT episode was already open when this fires, that prior
//     episode is being superseded/abandoned without ever being
//     explicitly resolved — it is left open and excluded below (never
//     incorrectly paired with a later, different-category resolution).
//   - collection_dispute_revised / collection_blocker_revised continue
//     the currently-open SAME-category episode (its open timestamp is
//     unchanged) — they never start a new episode and are otherwise
//     ignored here.
//   - collection_exception_resolved CLOSES the currently-open episode:
//     duration = this row's created_at - the episode's open timestamp,
//     attributed to the episode's category (from the resolved row's own
//     metadata.exceptionCategory when present, else the tracked
//     episode's category).
//
// A currently-open episode with no resolution row yet (case still
// disputed/blocked, or superseded and never explicitly resolved) has no
// end timestamp and is correctly excluded from the average — this is
// the "exclude cases where the necessary timestamps cannot be
// established confidently" rule in practice.

export interface ExceptionResolutionSpeed {
    dispute: DurationMetric;
    blocker: DurationMetric;
}

interface OpenExceptionEpisode {
    category: "dispute" | "blocker";
    openedAt: string;
}

export async function getExceptionResolutionSpeed(): Promise<ExceptionResolutionSpeed> {
    const rows = await fetchActivity([
        ActivityTypes.COLLECTION_DISPUTE_OPENED,
        ActivityTypes.COLLECTION_BLOCKER_OPENED,
        ActivityTypes.COLLECTION_DISPUTE_REVISED,
        ActivityTypes.COLLECTION_BLOCKER_REVISED,
        ActivityTypes.COLLECTION_EXCEPTION_RESOLVED,
    ]);

    const byCase = groupByCaseId(rows);

    const disputeDurationsHours: number[] = [];
    const blockerDurationsHours: number[] = [];

    for (const caseRows of byCase.values()) {
        let open: OpenExceptionEpisode | null = null;

        for (const row of caseRows) {
            if (row.activity_type === ActivityTypes.COLLECTION_DISPUTE_OPENED) {
                open = { category: "dispute", openedAt: row.created_at };
            } else if (row.activity_type === ActivityTypes.COLLECTION_BLOCKER_OPENED) {
                open = { category: "blocker", openedAt: row.created_at };
            } else if (
                row.activity_type === ActivityTypes.COLLECTION_DISPUTE_REVISED ||
                row.activity_type === ActivityTypes.COLLECTION_BLOCKER_REVISED
            ) {
                // Continues the currently-open episode; open timestamp
                // is deliberately left unchanged.
                continue;
            } else if (row.activity_type === ActivityTypes.COLLECTION_EXCEPTION_RESOLVED) {
                if (!open) continue; // no matching open episode — nothing to pair, skip defensively

                const durationHours = hoursBetween(open.openedAt, row.created_at);
                const category =
                    (row.metadata?.exceptionCategory as string | undefined) ?? open.category;

                if (category === "dispute") {
                    disputeDurationsHours.push(durationHours);
                } else if (category === "blocker") {
                    blockerDurationsHours.push(durationHours);
                }

                open = null;
            }
        }
    }

    return {
        dispute: toDurationMetric(disputeDurationsHours),
        blocker: toDurationMetric(blockerDurationsHours),
    };
}

// =========================================================================
// 4. ESCALATION EFFECTIVENESS
// =========================================================================
//
// Two independent sub-metrics, both computed per ESCALATION EPISODE
// (not per case — a case with 2 escalation cycles contributes 2 data
// points to each), reconstructed from activity_log the same way as
// exception episodes above.
//
// Episode boundary: an episode starts at a collection_case_escalated
// row and ends at the FIRST of the following rows that follows it
// chronologically for the same case:
//   - collection_case_guidance_provided (human answered with context)
//   - collection_case_resumed_by_human (human clicked plain Resume —
//     only ever logged by the API route layer, so this fires in real
//     production traffic; a test driving the SERVICE function directly,
//     as this file's own test suite does, will not produce this type —
//     that is expected, not a bug, see r9's own report on this)
//   - collection_case_resolved (case closed, autonomously or manually)
//   - the NEXT collection_case_escalated (re-escalation — something
//     ended the episode that this file has no other durable record of)
// collection_case_escalation_deferred ("Keep monitoring") is NOT a
// terminal event — the case is still escalated, still waiting — so it
// is skipped when scanning forward for the episode's outcome.
//
// An escalation with no following row yet (still escalated, nothing
// has happened since) has no determinable outcome and is excluded from
// both the timing average and its own byOutcomeType bucket.
//
// --- Paid-within-N-days attribution ---
//
// Per the approved scope, this does NOT join against the payments
// table (no collection_case_id FK exists there, and none is being
// added). Instead it uses the case's OWN current-row closed_reason —
// the same terminal, one-time fact getCaseResolutionBreakdown() above
// relies on. resolveCollectionCase() only ever writes 'resolved_paid'
// when the resolution was triggered by an actual recorded payment
// (evaluateOrOpenCollectionCase(..., { triggeredByPayment: true })) —
// that is the existing, already-computed "best-effort relationship
// between case/invoice/payment history" the approved scope refers to;
// this file does not invent a second one.
//
// For each escalation episode, given a window of N days from its own
// escalatedAt:
//   - paidWithinWindow: the case's closed_reason === 'resolved_paid'
//     AND closed_at falls within N days of THIS episode's escalatedAt.
//   - notPaidWithinWindow ("eligible but unpaid" — we know, we didn't
//     guess): the window has definitively closed without a same-window
//     paid resolution — either the case resolved for a different reason
//     (resolved_no_exposure/resolved_manual — a human or an unrelated
//     invoice adjustment closed it, not a confirmed payment event, so
//     it is never assumed to be a payment), or resolved_paid but AFTER
//     the window, or the case is still unresolved and N days have
//     already fully elapsed since this escalation with no resolution at
//     all.
//   - pendingUndetermined ("no eligible attribution yet" — genuinely
//     ambiguous, excluded from the rate): the case is still open/
//     unresolved and fewer than N days have elapsed since this
//     escalation — the window hasn't closed, so there is nothing to
//     attribute yet. This bucket is reported but never folded into the
//     rate denominator.
//
// A case that escalates twice can have one episode land in
// paidWithinWindow and the other in notPaidWithinWindow for the SAME
// eventual payment — that is intentional, not double-counting: each
// episode is independently answering "did payment follow within N days
// of THIS specific escalation," which is a genuinely different question
// per episode, not a re-count of one outcome.

export interface EscalationOutcomeTiming {
    guidance: DurationMetric;
    plainResume: DurationMetric;
    resolved: DurationMetric;
    reEscalated: DurationMetric;
    overall: DurationMetric;
}

export interface PaidWithinWindowMetric {
    windowDays: number;
    paidWithinWindow: number;
    notPaidWithinWindow: number;
    pendingUndetermined: number;
    // Denominator for `rate` is paidWithinWindow + notPaidWithinWindow —
    // pendingUndetermined is deliberately excluded (see header comment).
    eligibleTotal: number;
    rate: number | null;
}

export interface EscalationEffectiveness {
    totalEpisodes: number;
    outcomeTiming: EscalationOutcomeTiming;
    paidWithinWindow: PaidWithinWindowMetric;
}

interface EscalationEpisode {
    caseId: string;
    escalatedAt: string;
    outcome:
        | { kind: "guidance"; at: string }
        | { kind: "plainResume"; at: string }
        | { kind: "resolved"; at: string }
        | { kind: "reEscalated"; at: string }
        | { kind: "pending" };
}

async function reconstructEscalationEpisodes(): Promise<EscalationEpisode[]> {
    const rows = await fetchActivity([
        ActivityTypes.COLLECTION_CASE_ESCALATED,
        ActivityTypes.COLLECTION_CASE_GUIDANCE_PROVIDED,
        ActivityTypes.COLLECTION_CASE_RESUMED_BY_HUMAN,
        ActivityTypes.COLLECTION_CASE_RESOLVED,
        ActivityTypes.COLLECTION_CASE_ESCALATION_DEFERRED,
    ]);

    const byCase = groupByCaseId(rows);
    const episodes: EscalationEpisode[] = [];

    for (const [caseId, caseRows] of byCase.entries()) {
        // Every escalation row for this case, in order — each opens an
        // episode whose outcome is whatever non-defer row follows it.
        for (let i = 0; i < caseRows.length; i++) {
            const row = caseRows[i];
            if (row.activity_type !== ActivityTypes.COLLECTION_CASE_ESCALATED) continue;

            let outcome: EscalationEpisode["outcome"] = { kind: "pending" };

            for (let j = i + 1; j < caseRows.length; j++) {
                const candidate = caseRows[j];

                if (candidate.activity_type === ActivityTypes.COLLECTION_CASE_ESCALATION_DEFERRED) {
                    continue; // not terminal — still escalated, keep scanning
                }
                if (candidate.activity_type === ActivityTypes.COLLECTION_CASE_GUIDANCE_PROVIDED) {
                    outcome = { kind: "guidance", at: candidate.created_at };
                } else if (candidate.activity_type === ActivityTypes.COLLECTION_CASE_RESUMED_BY_HUMAN) {
                    outcome = { kind: "plainResume", at: candidate.created_at };
                } else if (candidate.activity_type === ActivityTypes.COLLECTION_CASE_RESOLVED) {
                    outcome = { kind: "resolved", at: candidate.created_at };
                } else if (candidate.activity_type === ActivityTypes.COLLECTION_CASE_ESCALATED) {
                    outcome = { kind: "reEscalated", at: candidate.created_at };
                }
                break;
            }

            episodes.push({ caseId, escalatedAt: row.created_at, outcome });
        }
    }

    return episodes;
}

export async function getEscalationEffectiveness(
    windowDays = 7 // matches the existing DISPUTE_REEVALUATION_INTERVAL_DAYS /
    // BLOCKER_CHECK_IN_INTERVAL_DAYS "check back in a week" cadence
    // already established in collectionDecisionEngine.ts — not a new
    // magic number, just a consistent default; callers can override it.
): Promise<EscalationEffectiveness> {
    const episodes = await reconstructEscalationEpisodes();

    const guidanceHours: number[] = [];
    const plainResumeHours: number[] = [];
    const resolvedHours: number[] = [];
    const reEscalatedHours: number[] = [];
    const overallHours: number[] = [];

    for (const episode of episodes) {
        if (episode.outcome.kind === "pending") continue;

        const durationHours = hoursBetween(episode.escalatedAt, episode.outcome.at);
        overallHours.push(durationHours);

        if (episode.outcome.kind === "guidance") guidanceHours.push(durationHours);
        else if (episode.outcome.kind === "plainResume") plainResumeHours.push(durationHours);
        else if (episode.outcome.kind === "resolved") resolvedHours.push(durationHours);
        else if (episode.outcome.kind === "reEscalated") reEscalatedHours.push(durationHours);
    }

    const outcomeTiming: EscalationOutcomeTiming = {
        guidance: toDurationMetric(guidanceHours),
        plainResume: toDurationMetric(plainResumeHours),
        resolved: toDurationMetric(resolvedHours),
        reEscalated: toDurationMetric(reEscalatedHours),
        overall: toDurationMetric(overallHours),
    };

    // --- Paid-within-N-days, using each case's current terminal state ---
    const caseIds = Array.from(new Set(episodes.map((episode) => episode.caseId)));

    let caseTerminalById = new Map<
        string,
        { status: string; closed_reason: string | null; closed_at: string | null }
    >();

    if (caseIds.length > 0) {
        const { data, error } = await supabase
            .from("collection_cases")
            .select("id, status, closed_reason, closed_at")
            .in("id", caseIds);

        if (error) throw error;

        caseTerminalById = new Map(
            ((data ?? []) as {
                id: string;
                status: string;
                closed_reason: string | null;
                closed_at: string | null;
            }[]).map((row) => [row.id, row])
        );
    }

    const now = new Date();
    let paidWithinWindow = 0;
    let notPaidWithinWindow = 0;
    let pendingUndetermined = 0;

    for (const episode of episodes) {
        const caseRow = caseTerminalById.get(episode.caseId);
        const windowCloses = new Date(episode.escalatedAt);
        windowCloses.setDate(windowCloses.getDate() + windowDays);

        if (caseRow?.status === "resolved" && caseRow.closed_at) {
            const withinWindow = new Date(caseRow.closed_at) <= windowCloses;

            if (caseRow.closed_reason === "resolved_paid" && withinWindow) {
                paidWithinWindow++;
            } else {
                // Either resolved for a non-payment reason, or paid but
                // after the window — both are a determined "no" for
                // THIS window, never assumed to be a payment.
                notPaidWithinWindow++;
            }
        } else if (now > windowCloses) {
            // Still unresolved, but the window has already fully
            // elapsed — we know for certain no payment closed it within
            // the window.
            notPaidWithinWindow++;
        } else {
            // Still unresolved and the window hasn't closed yet —
            // genuinely unknown, excluded from the rate.
            pendingUndetermined++;
        }
    }

    return {
        totalEpisodes: episodes.length,
        outcomeTiming,
        paidWithinWindow: {
            windowDays,
            paidWithinWindow,
            notPaidWithinWindow,
            pendingUndetermined,
            eligibleTotal: paidWithinWindow + notPaidWithinWindow,
            rate: toRate(paidWithinWindow, paidWithinWindow + notPaidWithinWindow).rate,
        },
    };
}

// =========================================================================
// 5. CASE RESOLUTION DURATION
// =========================================================================
//
// Source: collection_cases current state (opened_at/closed_at) — like
// getCaseResolutionBreakdown(), this reads terminal, one-time,
// never-revised fields, so the current row is authoritative; there is
// no historical-cycle reconstruction needed here.

export type CaseResolutionDuration = DurationMetric;

export async function getCaseResolutionDuration(): Promise<CaseResolutionDuration> {
    const { data, error } = await supabase
        .from("collection_cases")
        .select("opened_at, closed_at")
        .eq("status", "resolved")
        .limit(HISTORY_SCAN_LIMIT);

    if (error) throw error;

    const rows = (data ?? []) as { opened_at: string | null; closed_at: string | null }[];

    const durationsHours = rows
        .filter((row) => row.opened_at && row.closed_at)
        .map((row) => hoursBetween(row.opened_at as string, row.closed_at as string));

    return toDurationMetric(durationsHours);
}

// =========================================================================
// Combined summary — one call for a future dashboard, no separate
// aggregation logic to keep in sync with the individual functions above.
// =========================================================================

export interface CollectionOutcomesSummary {
    caseResolution: CaseResolutionBreakdown;
    promiseReliability: PromiseReliability;
    exceptionResolutionSpeed: ExceptionResolutionSpeed;
    escalationEffectiveness: EscalationEffectiveness;
    caseResolutionDuration: CaseResolutionDuration;
}

export async function getCollectionOutcomesSummary(
    escalationWindowDays = 7
): Promise<CollectionOutcomesSummary> {
    const [
        caseResolution,
        promiseReliability,
        exceptionResolutionSpeed,
        escalationEffectiveness,
        caseResolutionDuration,
    ] = await Promise.all([
        getCaseResolutionBreakdown(),
        getPromiseReliability(),
        getExceptionResolutionSpeed(),
        getEscalationEffectiveness(escalationWindowDays),
        getCaseResolutionDuration(),
    ]);

    return {
        caseResolution,
        promiseReliability,
        exceptionResolutionSpeed,
        escalationEffectiveness,
        caseResolutionDuration,
    };
}
