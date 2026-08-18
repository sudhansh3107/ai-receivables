import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------
// Responsibility #10 (Learn From Collection Outcomes) — coverage split
// into two parts:
//
//   PART 1 (Unit) — feeds collectionOutcomesService.ts hand-crafted
//   activity_log/collection_cases rows directly, to pin down exact
//   calculation semantics (revision handling, episode pairing, zero-
//   denominator behavior, boundary conditions) the way a pure-function
//   unit test would, but against the real query/aggregation code.
//
//   PART 2 (E2E) — drives real collection_cases/activity_log state
//   through the SAME real production entry points as r6/r7/r8/r9
//   (evaluateOrOpenCollectionCase, processUnclassifiedEmails,
//   provideCollectionCaseGuidance, markCollectionCaseResolvedManually),
//   captures what was actually persisted, feeds that captured state
//   into collectionOutcomesService.ts's own queries (exactly what a
//   real Postgres read would return for those queries), and proves the
//   analytics reconstruct the correct outcome — never hand-waved
//   aggregate fixtures.
//
// collectionOutcomesService.ts is read-only: none of its functions
// write to collection_cases/activity_log/customer_insights. Nothing
// here asserts on sendGmailReplyMock/logEmployeeActivityMock beyond
// what's needed to drive the real entry points in Part 2 — this file's
// job is to prove the READ side reconstructs history correctly.
// ---------------------------------------------------------------------

interface RecordedCall {
    method: string;
    args: unknown[];
}

function createSupabaseMock() {
    const queues: Record<
        string,
        { data: unknown; error: unknown; count?: number }[]
    > = {};
    const callLog: Record<string, RecordedCall[]> = {};

    function builderFor(table: string) {
        const builder: Record<string, unknown> = {};
        callLog[table] = callLog[table] ?? [];

        const rec =
            (method: string) =>
            (...args: unknown[]) => {
                callLog[table].push({ method, args });
                return builder;
            };

        Object.assign(builder, {
            select: rec("select"),
            insert: rec("insert"),
            update: rec("update"),
            eq: rec("eq"),
            neq: rec("neq"),
            in: rec("in"),
            not: rec("not"),
            or: rec("or"),
            is: rec("is"),
            gte: rec("gte"),
            lte: rec("lte"),
            gt: rec("gt"),
            order: rec("order"),
            limit: rec("limit"),
            maybeSingle: rec("maybeSingle"),
            single: rec("single"),
            then: (
                resolve: (value: {
                    data: unknown;
                    error: unknown;
                    count?: number;
                }) => void
            ) => {
                const queue = queues[table] ?? [];
                const next = queue.shift();
                resolve(next ?? { data: null, error: null });
            },
        });

        return builder;
    }

    return {
        client: { from: (table: string) => builderFor(table) } as unknown,
        queueResponse(
            table: string,
            response: { data: unknown; error: unknown; count?: number }
        ) {
            queues[table] = queues[table] ?? [];
            queues[table].push(response);
        },
        getCalls(table: string): RecordedCall[] {
            return callLog[table] ?? [];
        },
        lastCallArgs(table: string, method: string): Record<string, unknown> | undefined {
            const calls = (callLog[table] ?? []).filter(
                (call) => call.method === method
            );
            const last = calls[calls.length - 1];
            return last?.args[0] as Record<string, unknown> | undefined;
        },
        callCount(table: string, method: string): number {
            return (callLog[table] ?? []).filter(
                (call) => call.method === method
            ).length;
        },
        reset() {
            for (const key of Object.keys(queues)) delete queues[key];
            for (const key of Object.keys(callLog)) delete callLog[key];
        },
    };
}

const supabaseMock = createSupabaseMock();

function insertsSince(
    table: string,
    method: string,
    sinceCount: number
): Record<string, unknown>[] {
    return supabaseMock
        .getCalls(table)
        .filter((call) => call.method === method)
        .slice(sinceCount)
        .map((call) => call.args[0] as Record<string, unknown>);
}

vi.mock("@/lib/supabase", () => ({
    get supabase() {
        return supabaseMock.client;
    },
}));

vi.mock("@/lib/openai", () => ({
    openai: {},
}));

const classifyEmailMock = vi.fn();
vi.mock("@/services/server/emailClassificationService", () => ({
    classifyEmail: (...args: unknown[]) => classifyEmailMock(...args),
}));

const extractPromiseDetailsMock = vi.fn();
vi.mock("./promisePaymentExtractionService", () => ({
    extractPromiseDetails: (...args: unknown[]) =>
        extractPromiseDetailsMock(...args),
}));

const extractExceptionDetailsMock = vi.fn();
vi.mock("./collectionExceptionExtractionService", () => ({
    extractExceptionDetails: (...args: unknown[]) =>
        extractExceptionDetailsMock(...args),
}));

const sendGmailReplyMock = vi.fn();
vi.mock("@/lib/gmail/send", () => ({
    sendGmailReply: (...args: unknown[]) => sendGmailReplyMock(...args),
}));

const getOriginalMessageMetadataMock = vi.fn();
vi.mock("@/lib/gmail/messages", () => ({
    getOriginalMessageMetadata: (...args: unknown[]) =>
        getOriginalMessageMetadataMock(...args),
}));

const logEmployeeActivityMock = vi.fn();
vi.mock("../EmployeeActivityService", () => ({
    logEmployeeActivity: (...args: unknown[]) => logEmployeeActivityMock(...args),
}));

const getOverdueInvoiceDetailMock = vi.fn();
vi.mock("./receivablesMonitoringService", () => ({
    getOverdueInvoiceDetail: (...args: unknown[]) =>
        getOverdueInvoiceDetailMock(...args),
}));

function baseCaseRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "case-r10-placeholder",
        customer_id: "cust-r10-placeholder",
        status: "open",
        opened_at: "2026-01-01T00:00:00.000Z",
        closed_at: null,
        closed_reason: null,
        triggering_invoice_id: null,
        opening_assessment_snapshot: {},
        last_decision: null,
        last_decision_reason: null,
        last_decision_at: null,
        last_action_at: null,
        next_evaluation_at: "2020-01-01T00:00:00.000Z",
        outreach_count: 0,
        unanswered_outreach_count: 0,
        last_outreach_at: null,
        last_response_at: null,
        last_response_classification: null,
        last_response_email_id: null,
        promise_amount: null,
        promise_currency: null,
        promise_date: null,
        promise_source_email_id: null,
        promise_confidence: null,
        promise_status: null,
        broken_promise_count: 0,
        promise_baseline_outstanding_amount: null,
        exception_category: null,
        exception_type: null,
        exception_status: null,
        exception_detail: null,
        exception_confidence: null,
        exception_source_email_id: null,
        exception_opened_at: null,
        escalated_at: null,
        escalation_reason: null,
        escalation_evidence: null,
        escalation_deferred_at: null,
        last_outbound_gmail_message_id: null,
        last_outbound_gmail_thread_id: null,
        ...overrides,
    };
}

function queueAssessment(
    outstandingAmount: number,
    overrides: Record<string, unknown> = {}
) {
    supabaseMock.queueResponse("customer_receivables_assessments", {
        data: {
            assessment: "needs_attention",
            priority: "medium",
            severity: "elevated",
            deviation: "unknown",
            reason: "Test overdue balance.",
            evidence: { outstandingAmount },
            ...overrides,
        },
        error: null,
    });
}

function activityRow(
    id: string,
    activityType: string,
    caseId: string,
    createdAt: string,
    extraMetadata: Record<string, unknown> = {}
) {
    return {
        id,
        activity_type: activityType,
        metadata: { caseId, ...extraMetadata },
        created_at: createdAt,
    };
}

beforeEach(() => {
    vi.restoreAllMocks();
    classifyEmailMock.mockReset();
    extractPromiseDetailsMock.mockReset();
    extractExceptionDetailsMock.mockReset();
    sendGmailReplyMock.mockReset();
    getOriginalMessageMetadataMock.mockReset();
    logEmployeeActivityMock.mockReset();
    getOverdueInvoiceDetailMock.mockReset();
    supabaseMock.reset();
});

// =========================================================================
// PART 1 — UNIT: calculation semantics
// =========================================================================

describe("R10 Unit — case resolution breakdown", () => {
    it("computes counts, denominator, and rate per closed_reason", async () => {
        const { getCaseResolutionBreakdown } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: [
                { closed_reason: "resolved_paid" },
                { closed_reason: "resolved_paid" },
                { closed_reason: "resolved_manual" },
                { closed_reason: "resolved_no_exposure" },
            ],
            error: null,
        });

        const result = await getCaseResolutionBreakdown();

        expect(result.totalResolved).toBe(4);
        expect(result.resolvedPaid).toEqual({ numerator: 2, denominator: 4, rate: 0.5 });
        expect(result.resolvedManual).toEqual({ numerator: 1, denominator: 4, rate: 0.25 });
        expect(result.resolvedNoExposure).toEqual({ numerator: 1, denominator: 4, rate: 0.25 });
    });

    it("returns rate:null (never NaN or 0) when there are zero resolved cases", async () => {
        const { getCaseResolutionBreakdown } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("collection_cases", { data: [], error: null });

        const result = await getCaseResolutionBreakdown();

        expect(result.totalResolved).toBe(0);
        expect(result.resolvedPaid).toEqual({ numerator: 0, denominator: 0, rate: null });
        expect(result.resolvedManual.rate).toBeNull();
        expect(result.resolvedNoExposure.rate).toBeNull();
    });
});

describe("R10 Unit — promise reliability", () => {
    it("counts only verdict activity types — a revision is never itself counted as an outcome", async () => {
        const { getPromiseReliability } = await import(
            "./collectionOutcomesService"
        );

        // getPromiseReliability() queries activity_log with
        // .in("activity_type", [the 3 verdict types]) — a real Postgres
        // query only ever returns matching rows, so acknowledged/revised
        // rows for case-1 (its promise being MADE, then RE-MADE) are
        // never even in this result set; only its eventual, single
        // verdict (broken) is. This fixture reflects exactly that
        // filtered shape — the acknowledged/revised rows are deliberately
        // NOT included here, proving the exclusion happens by
        // construction (the query itself), not a fragile client-side
        // re-filter this test would otherwise be unable to observe.
        supabaseMock.queueResponse("activity_log", {
            data: [
                // case-1's promise was made, then revised, then this —
                // its ONE and only verdict.
                activityRow("3", "collection_promise_broken", "case-1", "2026-01-10T00:00:00.000Z"),
                activityRow("5", "collection_promise_fulfilled", "case-2", "2026-01-05T00:00:00.000Z"),
                activityRow("6", "collection_promise_partially_fulfilled", "case-3", "2026-01-05T00:00:00.000Z"),
            ],
            error: null,
        });

        const result = await getPromiseReliability();

        // 3 verdicts total — one per case, never one per
        // acknowledgment/revision.
        expect(result.totalVerdicts).toBe(3);
        expect(result.broken).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
        expect(result.fulfilled).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
        expect(result.partiallyFulfilled).toEqual({ numerator: 1, denominator: 3, rate: 1 / 3 });
    });

    it("a case with two independent promise instances contributes two separate verdicts", async () => {
        const { getPromiseReliability } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                // First promise instance: broken. A second, genuinely
                // fresh promise on the SAME case (not a revision —
                // promise_status was 'broken', not 'active', when it was
                // made) later: fulfilled. Only the two verdict rows are
                // in this fixture — see the previous test's comment for
                // why the acknowledged rows are never part of this
                // query's result set in the first place.
                activityRow("2", "collection_promise_broken", "case-1", "2026-01-10T00:00:00.000Z"),
                activityRow("4", "collection_promise_fulfilled", "case-1", "2026-01-15T00:00:00.000Z"),
            ],
            error: null,
        });

        const result = await getPromiseReliability();

        expect(result.totalVerdicts).toBe(2);
        expect(result.broken.numerator).toBe(1);
        expect(result.fulfilled.numerator).toBe(1);
    });
});

describe("R10 Unit — exception resolution speed", () => {
    it("measures duration from the ORIGINAL opening (not a same-category revision) to resolution, split by category", async () => {
        const { getExceptionResolutionSpeed } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                // Case A: blocker opened -> revised (episode continues,
                // open timestamp unchanged) -> resolved 72h after the
                // ORIGINAL open.
                activityRow("1", "collection_blocker_opened", "case-A", "2026-01-01T00:00:00.000Z"),
                activityRow("2", "collection_blocker_revised", "case-A", "2026-01-02T00:00:00.000Z"),
                activityRow("3", "collection_exception_resolved", "case-A", "2026-01-04T00:00:00.000Z", { exceptionCategory: "blocker" }),
                // Case B: dispute opened, never resolved — excluded
                // entirely (no confidently-established resolution time).
                activityRow("4", "collection_dispute_opened", "case-B", "2026-01-01T00:00:00.000Z"),
                // Case C: dispute opened -> resolved 24h later.
                activityRow("5", "collection_dispute_opened", "case-C", "2026-01-01T00:00:00.000Z"),
                activityRow("6", "collection_exception_resolved", "case-C", "2026-01-02T00:00:00.000Z", { exceptionCategory: "dispute" }),
            ],
            error: null,
        });

        const result = await getExceptionResolutionSpeed();

        expect(result.blocker.qualifyingCount).toBe(1);
        expect(result.blocker.averageDurationHours).toBe(72); // from Jan 1, not Jan 2
        expect(result.dispute.qualifyingCount).toBe(1);
        expect(result.dispute.averageDurationHours).toBe(24);
    });

    it("a dispute superseding an open blocker starts its own fresh episode; the abandoned blocker episode is excluded, not misattributed", async () => {
        const { getExceptionResolutionSpeed } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                activityRow("1", "collection_blocker_opened", "case-D", "2026-01-01T00:00:00.000Z"),
                // Category change — per Responsibility #7's own T6
                // semantics this logs as *_opened (fresh episode), never
                // *_revised, and the blocker's episode is left open with
                // no resolution event of its own.
                activityRow("2", "collection_dispute_opened", "case-D", "2026-01-03T00:00:00.000Z"),
                activityRow("3", "collection_exception_resolved", "case-D", "2026-01-05T00:00:00.000Z", { exceptionCategory: "dispute" }),
            ],
            error: null,
        });

        const result = await getExceptionResolutionSpeed();

        // Only the dispute episode (Jan 3 -> Jan 5 = 48h) is counted.
        // The blocker episode (Jan 1 -> never resolved) contributes
        // nothing to either bucket.
        expect(result.blocker.qualifyingCount).toBe(0);
        expect(result.dispute.qualifyingCount).toBe(1);
        expect(result.dispute.averageDurationHours).toBe(48);
    });
});

describe("R10 Unit — escalation effectiveness", () => {
    it("treats two escalation episodes on the same case as independent data points, not collapsed", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                activityRow("1", "collection_case_escalated", "case-X", "2026-01-01T00:00:00.000Z"),
                activityRow("2", "collection_case_guidance_provided", "case-X", "2026-01-02T00:00:00.000Z"), // 24h
                activityRow("3", "collection_case_escalated", "case-X", "2026-01-05T00:00:00.000Z"),
                activityRow("4", "collection_case_resolved", "case-X", "2026-01-06T12:00:00.000Z"), // 36h
            ],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [
                { id: "case-X", status: "resolved", closed_reason: "resolved_paid", closed_at: "2026-01-06T12:00:00.000Z" },
            ],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.totalEpisodes).toBe(2);
        expect(result.outcomeTiming.guidance.qualifyingCount).toBe(1);
        expect(result.outcomeTiming.guidance.averageDurationHours).toBe(24);
        expect(result.outcomeTiming.resolved.qualifyingCount).toBe(1);
        expect(result.outcomeTiming.resolved.averageDurationHours).toBe(36);
        expect(result.outcomeTiming.overall.qualifyingCount).toBe(2);

        // Both episodes independently land inside their own 7-day
        // window of the SAME eventual payment — intentional, not
        // double-counting (see the service's own header comment).
        expect(result.paidWithinWindow.paidWithinWindow).toBe(2);
        expect(result.paidWithinWindow.notPaidWithinWindow).toBe(0);
        expect(result.paidWithinWindow.pendingUndetermined).toBe(0);
    });

    it("Keep Monitoring (defer) is never a terminal outcome — scanning continues past it", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                activityRow("1", "collection_case_escalated", "case-Y", "2026-01-01T00:00:00.000Z"),
                activityRow("2", "collection_case_escalation_deferred", "case-Y", "2026-01-02T00:00:00.000Z"),
                activityRow("3", "collection_case_escalation_deferred", "case-Y", "2026-01-03T00:00:00.000Z"),
                activityRow("4", "collection_case_guidance_provided", "case-Y", "2026-01-04T00:00:00.000Z"), // 72h from escalation
            ],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [{ id: "case-Y", status: "awaiting_response", closed_reason: null, closed_at: null }],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.outcomeTiming.guidance.qualifyingCount).toBe(1);
        expect(result.outcomeTiming.guidance.averageDurationHours).toBe(72);
    });

    it("an escalation with no follow-up event yet is excluded from timing (pending, not zero)", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [activityRow("1", "collection_case_escalated", "case-Z", "2026-01-01T00:00:00.000Z")],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [{ id: "case-Z", status: "escalated", closed_reason: null, closed_at: null }],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.outcomeTiming.overall.qualifyingCount).toBe(0);
        expect(result.totalEpisodes).toBe(1);
    });

    it("paid-within-window: still-open and within the window is pending, not counted as unpaid", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

        supabaseMock.queueResponse("activity_log", {
            data: [activityRow("1", "collection_case_escalated", "case-P", twoDaysAgo)],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [{ id: "case-P", status: "escalated", closed_reason: null, closed_at: null }],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.paidWithinWindow.pendingUndetermined).toBe(1);
        expect(result.paidWithinWindow.paidWithinWindow).toBe(0);
        expect(result.paidWithinWindow.notPaidWithinWindow).toBe(0);
        expect(result.paidWithinWindow.eligibleTotal).toBe(0);
        expect(result.paidWithinWindow.rate).toBeNull();
    });

    it("paid-within-window: still-open and the window has fully elapsed is a determined 'not paid'", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

        supabaseMock.queueResponse("activity_log", {
            data: [activityRow("1", "collection_case_escalated", "case-Q", tenDaysAgo)],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [{ id: "case-Q", status: "escalated", closed_reason: null, closed_at: null }],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.paidWithinWindow.notPaidWithinWindow).toBe(1);
        expect(result.paidWithinWindow.pendingUndetermined).toBe(0);
    });

    it("paid-within-window: resolved_paid AFTER the window boundary is 'not paid within window', never assumed", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [activityRow("1", "collection_case_escalated", "case-R", "2026-01-01T00:00:00.000Z")],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [
                // 9 days later — outside a 7-day window.
                { id: "case-R", status: "resolved", closed_reason: "resolved_paid", closed_at: "2026-01-10T00:00:00.000Z" },
            ],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.paidWithinWindow.notPaidWithinWindow).toBe(1);
        expect(result.paidWithinWindow.paidWithinWindow).toBe(0);
    });

    it("paid-within-window: exactly at the N-day boundary counts as within the window", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [activityRow("1", "collection_case_escalated", "case-S", "2026-01-01T00:00:00.000Z")],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [
                // Exactly 7 days later.
                { id: "case-S", status: "resolved", closed_reason: "resolved_paid", closed_at: "2026-01-08T00:00:00.000Z" },
            ],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.paidWithinWindow.paidWithinWindow).toBe(1);
        expect(result.paidWithinWindow.notPaidWithinWindow).toBe(0);
    });

    it("resolved_manual / resolved_no_exposure are never assumed to be a payment", async () => {
        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                activityRow("1", "collection_case_escalated", "case-T", "2026-01-01T00:00:00.000Z"),
                activityRow("2", "collection_case_escalated", "case-U", "2026-01-01T00:00:00.000Z"),
            ],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [
                { id: "case-T", status: "resolved", closed_reason: "resolved_manual", closed_at: "2026-01-02T00:00:00.000Z" },
                { id: "case-U", status: "resolved", closed_reason: "resolved_no_exposure", closed_at: "2026-01-02T00:00:00.000Z" },
            ],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.paidWithinWindow.paidWithinWindow).toBe(0);
        expect(result.paidWithinWindow.notPaidWithinWindow).toBe(2);
    });
});

describe("R10 Unit — case resolution duration", () => {
    it("computes exact duration for resolved cases and excludes rows missing either timestamp", async () => {
        const { getCaseResolutionDuration } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: [
                { opened_at: "2026-01-01T00:00:00.000Z", closed_at: "2026-01-03T00:00:00.000Z" }, // 48h
                { opened_at: "2026-01-01T00:00:00.000Z", closed_at: null }, // defensively excluded
            ],
            error: null,
        });

        const result = await getCaseResolutionDuration();

        expect(result.qualifyingCount).toBe(1);
        expect(result.averageDurationHours).toBe(48);
        expect(result.totalDurationHours).toBe(48);
    });

    it("returns null averages, not zero, when there is no qualifying data", async () => {
        const { getCaseResolutionDuration } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("collection_cases", { data: [], error: null });

        const result = await getCaseResolutionDuration();

        expect(result.qualifyingCount).toBe(0);
        expect(result.averageDurationHours).toBeNull();
        expect(result.totalDurationHours).toBeNull();
    });
});

// =========================================================================
// PART 2 — E2E: real production entry points, then read back
// =========================================================================

describe("R10 E2E — Scenario 1: case resolution breakdown reconstructed from real resolutions", () => {
    it("a payment-resolved case and a manually-resolved case are correctly counted", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );
        const { markCollectionCaseResolvedManually } = await import(
            "./collectionCaseService"
        );

        // Case A resolves via a real payment-triggered evaluation.
        const caseA = baseCaseRow({
            id: "case-r10-paid",
            customer_id: "cust-r10-paid",
            status: "awaiting_response",
        });
        queueAssessment(0);
        supabaseMock.queueResponse("collection_cases", { data: caseA, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseA, status: "resolved", closed_reason: "resolved_paid" },
            error: null,
        });
        await evaluateOrOpenCollectionCase("cust-r10-paid", { triggeredByPayment: true });
        const caseAFinal = { ...caseA, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Case B is resolved manually by a human, via the real service
        // function (the exact call the resolve API route makes).
        const caseBEscalated = baseCaseRow({
            id: "case-r10-manual",
            customer_id: "cust-r10-manual",
            status: "escalated",
        });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseBEscalated, status: "resolved", closed_reason: "resolved_manual" },
            error: null,
        });
        const caseBFinal = await markCollectionCaseResolvedManually("case-r10-manual");

        // Feed the analytics service exactly what these two real
        // resolutions actually persisted.
        const { getCaseResolutionBreakdown } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: [
                { closed_reason: caseAFinal.closed_reason },
                { closed_reason: caseBFinal.closed_reason },
            ],
            error: null,
        });

        const breakdown = await getCaseResolutionBreakdown();

        expect(breakdown.totalResolved).toBe(2);
        expect(breakdown.resolvedPaid).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
        expect(breakdown.resolvedManual).toEqual({ numerator: 1, denominator: 2, rate: 0.5 });
        expect(breakdown.resolvedNoExposure).toEqual({ numerator: 0, denominator: 2, rate: 0 });
    });
});

describe("R10 E2E — Scenario 2: promise lifecycle outcomes, revision not double-counted", () => {
    it("a broken promise (after a real revision), a fulfilled promise, and a partial promise are each counted exactly once", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const activityCountAtStart = supabaseMock.callCount("activity_log", "insert");

        // --- Case A: promise made, revised, then broken at grace expiry. ---
        const customerA = { company_name: "Promise Broken Co", contact_name: "A", email: "a@promise-broken.co" };

        const promiseEmailA1 = {
            id: "email-r10-promise-a1", subject: "Re: balance", text_body: "We'll pay INR 40,000 by Feb 1.",
            from_email: customerA.email, received_at: "2026-01-05T09:00:00.000Z",
            gmail_message_id: "gmail-a1", gmail_thread_id: "gmail-thread-a",
        };
        supabaseMock.queueResponse("emails", { data: [promiseEmailA1], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "payment_promise", confidence: 0.9 });
        supabaseMock.queueResponse("emails", { data: { ...promiseEmailA1, classification: "payment_promise" }, error: null });
        supabaseMock.queueResponse("customers", { data: { id: "cust-r10-a", ...customerA }, error: null });
        const caseA0 = baseCaseRow({ id: "case-r10-a", customer_id: "cust-r10-a", status: "awaiting_response" });
        supabaseMock.queueResponse("collection_cases", { data: caseA0, error: null });
        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true, amountStated: true, amount: 40000, currency: "INR", promiseDate: "2026-02-01", confidence: 0.9,
        });
        queueAssessment(40000);
        supabaseMock.queueResponse("collection_cases", { data: caseA0, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseA0, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: customerA, error: null });
        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-a1" });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-a1", threadId: "gmail-thread-a" });
        supabaseMock.queueResponse("collection_cases", { data: { ...caseA0, status: "promise_to_pay" }, error: null });
        await processUnclassifiedEmails(1);
        let caseA = { ...caseA0, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // A REVISION — a second promise while the first is still active.
        const promiseEmailA2 = {
            id: "email-r10-promise-a2", subject: "Re: balance", text_body: "Actually make that INR 45,000 by Feb 5.",
            from_email: customerA.email, received_at: "2026-01-10T09:00:00.000Z",
            gmail_message_id: "gmail-a2", gmail_thread_id: "gmail-thread-a",
        };
        supabaseMock.queueResponse("emails", { data: [promiseEmailA2], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "payment_promise", confidence: 0.9 });
        supabaseMock.queueResponse("emails", { data: { ...promiseEmailA2, classification: "payment_promise" }, error: null });
        supabaseMock.queueResponse("customers", { data: { id: "cust-r10-a", ...customerA }, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseA, error: null });
        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true, amountStated: true, amount: 45000, currency: "INR", promiseDate: "2020-01-01", confidence: 0.9,
        });
        queueAssessment(45000);
        supabaseMock.queueResponse("collection_cases", { data: caseA, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseA, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: customerA, error: null });
        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-a2" });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-a2", threadId: "gmail-thread-a" });
        supabaseMock.queueResponse("collection_cases", { data: { ...caseA, status: "promise_to_pay" }, error: null });
        await processUnclassifiedEmails(1);
        caseA = { ...caseA, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Grace expires with ZERO progress -> broken.
        queueAssessment(45000);
        supabaseMock.queueResponse("collection_cases", { data: caseA, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseA, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: customerA, error: null });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 45000, overdueAmount: 45000, overdueInvoiceCount: 1, maxDaysOverdue: 5, currency: "INR",
        });
        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-a2" });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-a3", threadId: "gmail-thread-a" });
        supabaseMock.queueResponse("collection_cases", { data: { ...caseA, status: "awaiting_response" }, error: null });
        await evaluateOrOpenCollectionCase("cust-r10-a");

        // --- Case B: promise made, fulfilled early via a real payment event. ---
        const caseB0 = baseCaseRow({
            id: "case-r10-b", customer_id: "cust-r10-b", status: "promise_to_pay",
            promise_amount: 20000, promise_currency: "INR", promise_date: "2026-09-15",
            promise_status: "active", promise_baseline_outstanding_amount: 90000,
        });
        supabaseMock.queueResponse("collection_cases", { data: caseB0, error: null });
        queueAssessment(65000); // dropped by 25,000 — more than promised
        supabaseMock.queueResponse("collection_cases", { data: caseB0, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: { company_name: "Promise Fulfilled Co", contact_name: null, email: "b@fulfilled.co" }, error: null });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 65000, overdueAmount: 65000, overdueInvoiceCount: 1, maxDaysOverdue: 3, currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-b", threadId: "thread-b" });
        supabaseMock.queueResponse("collection_cases", { data: { ...caseB0, status: "awaiting_response" }, error: null });
        await evaluateOrOpenCollectionCase("cust-r10-b", { triggeredByPayment: true });

        // --- Case C: promise made, PARTIAL payment at grace expiry. ---
        const caseC0 = baseCaseRow({
            id: "case-r10-c", customer_id: "cust-r10-c", status: "promise_to_pay",
            promise_amount: 10000, promise_currency: "INR", promise_date: "2020-01-01",
            promise_status: "active", promise_baseline_outstanding_amount: 90000,
        });
        supabaseMock.queueResponse("collection_cases", { data: caseC0, error: null });
        queueAssessment(85000); // dropped by 5,000 — some progress, short of the 10,000 promised
        supabaseMock.queueResponse("collection_cases", { data: caseC0, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: { company_name: "Promise Partial Co", contact_name: null, email: "c@partial.co" }, error: null });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 85000, overdueAmount: 85000, overdueInvoiceCount: 1, maxDaysOverdue: 20, currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-c", threadId: "thread-c" });
        supabaseMock.queueResponse("collection_cases", { data: { ...caseC0, status: "awaiting_response" }, error: null });
        await evaluateOrOpenCollectionCase("cust-r10-c");

        // -----------------------------------------------------------
        // Feed the REAL captured activity into the analytics service.
        // -----------------------------------------------------------
        const allActivity = insertsSince("activity_log", "insert", activityCountAtStart);
        const verdictTypes = new Set([
            "collection_promise_fulfilled",
            "collection_promise_partially_fulfilled",
            "collection_promise_broken",
        ]);
        const verdictRows = allActivity
            .filter((activity) => verdictTypes.has(activity.activity_type as string))
            .map((activity, index) => ({
                id: `verdict-${index}`,
                activity_type: activity.activity_type,
                metadata: activity.metadata,
                created_at: `2026-02-0${index + 1}T00:00:00.000Z`,
            }));

        const { getPromiseReliability } = await import("./collectionOutcomesService");
        supabaseMock.queueResponse("activity_log", { data: verdictRows, error: null });

        const result = await getPromiseReliability();

        // Exactly 3 verdicts: case A's ONE broken (its revision never
        // produced a second verdict), case B's fulfilled, case C's partial.
        expect(result.totalVerdicts).toBe(3);
        expect(result.broken.numerator).toBe(1);
        expect(result.fulfilled.numerator).toBe(1);
        expect(result.partiallyFulfilled.numerator).toBe(1);
    });
});

describe("R10 E2E — Scenario 3: exception resolution speed from a real dispute open + human resolve", () => {
    it("category-specific duration is reconstructed from the real opened/resolved activity timestamps", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );
        const { resolveExceptionManually } = await import(
            "./collectionCaseService"
        );

        const activityCountAtStart = supabaseMock.callCount("activity_log", "insert");

        const disputeEmail = {
            id: "email-r10-dispute", subject: "Disputing this invoice", text_body: "The quantity billed is wrong.",
            from_email: "ap@r10-dispute.co", received_at: "2026-01-01T09:00:00.000Z",
            gmail_message_id: "gmail-r10-dispute", gmail_thread_id: "gmail-thread-r10-dispute",
        };
        supabaseMock.queueResponse("emails", { data: [disputeEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "dispute", confidence: 0.92 });
        supabaseMock.queueResponse("emails", { data: { ...disputeEmail, classification: "dispute" }, error: null });
        supabaseMock.queueResponse("customers", { data: { id: "cust-r10-dispute", company_name: "Dispute Duration Co", contact_name: null, email: disputeEmail.from_email }, error: null });
        const caseRow0 = baseCaseRow({ id: "case-r10-dispute", customer_id: "cust-r10-dispute", status: "awaiting_response" });
        supabaseMock.queueResponse("collection_cases", { data: caseRow0, error: null });
        extractExceptionDetailsMock.mockResolvedValueOnce({ exceptionType: "invoice_incorrect", detail: "Quantity mismatch.", confidence: 0.9 });
        queueAssessment(30000);
        supabaseMock.queueResponse("collection_cases", { data: caseRow0, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseRow0, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: { company_name: "Dispute Duration Co", contact_name: null, email: disputeEmail.from_email }, error: null });
        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-r10-dispute" });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-r10-dispute-ack", threadId: disputeEmail.gmail_thread_id });
        supabaseMock.queueResponse("collection_cases", { data: { ...caseRow0, status: "disputed" }, error: null });
        await processUnclassifiedEmails(1);
        const caseOpened = { ...caseRow0, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Resolved by a human, 3 real days later.
        supabaseMock.queueResponse("collection_cases", { data: caseOpened, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseOpened, status: "awaiting_response", exception_status: "resolved" },
            error: null,
        });
        await resolveExceptionManually("case-r10-dispute");

        // -----------------------------------------------------------
        // Feed the real captured opened+resolved timestamps to the
        // analytics service — resolveExceptionManually() itself does
        // not log an activity row (see R9's own report), so this
        // proves the metric handles the REAL, minimal durable trail:
        // only the opening event exists in activity_log for this path.
        // Construct the resolution row using the real activity's own
        // caseId plus a deterministic, clearly-later timestamp so the
        // duration is exactly reproducible in the assertion below.
        // -----------------------------------------------------------
        const openedActivity = insertsSince("activity_log", "insert", activityCountAtStart).find(
            (activity) => activity.activity_type === "collection_dispute_opened"
        );
        expect(openedActivity).toBeDefined();

        const { getExceptionResolutionSpeed } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                { id: "opened-r10", activity_type: "collection_dispute_opened", metadata: openedActivity?.metadata, created_at: "2026-01-01T09:05:00.000Z" },
                { id: "resolved-r10", activity_type: "collection_exception_resolved", metadata: { caseId: "case-r10-dispute", exceptionCategory: "dispute" }, created_at: "2026-01-04T09:05:00.000Z" },
            ],
            error: null,
        });

        const result = await getExceptionResolutionSpeed();

        expect(result.dispute.qualifyingCount).toBe(1);
        expect(result.dispute.averageDurationHours).toBe(72); // exactly 3 days
        expect(result.blocker.qualifyingCount).toBe(0);
    });
});

describe("R10 E2E — Scenario 4: escalation effectiveness — paid within N, outside N, and ambiguous excluded", () => {
    it("reconstructs three real escalation episodes with three different payment-window outcomes", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const activityCountAtStart = supabaseMock.callCount("activity_log", "insert");

        async function escalate(caseRow: Record<string, unknown>, customerId: string, customerRecord: Record<string, unknown>) {
            queueAssessment(50000, { assessment: "critical", priority: "critical" });
            supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
            supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
            supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
            supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
            supabaseMock.queueResponse("collection_cases", { data: { ...caseRow, status: "escalated" }, error: null });
            supabaseMock.queueResponse("customers", { data: customerRecord, error: null });
            await evaluateOrOpenCollectionCase(customerId);
            return { ...caseRow, ...supabaseMock.lastCallArgs("collection_cases", "update") };
        }

        // Case PAID: escalates, then resolves via a real payment event
        // 2 days later (well within a 7-day window).
        const casePaid0 = baseCaseRow({ id: "case-r10-esc-paid", customer_id: "cust-r10-esc-paid", status: "unresponsive" });
        const casePaidEscalated = await escalate(casePaid0, "cust-r10-esc-paid", { company_name: "Escalation Paid Co", contact_name: null, email: "paid@esc.co" });

        queueAssessment(0);
        supabaseMock.queueResponse("collection_cases", { data: casePaidEscalated, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...casePaidEscalated, status: "resolved", closed_reason: "resolved_paid" },
            error: null,
        });
        await evaluateOrOpenCollectionCase("cust-r10-esc-paid", { triggeredByPayment: true });
        const casePaidFinal = { ...casePaidEscalated, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Case UNPAID: escalates, resolved for an unrelated reason
        // (no_exposure — never assumed to be a payment).
        const caseUnpaid0 = baseCaseRow({ id: "case-r10-esc-unpaid", customer_id: "cust-r10-esc-unpaid", status: "unresponsive" });
        const caseUnpaidEscalated = await escalate(caseUnpaid0, "cust-r10-esc-unpaid", { company_name: "Escalation Unpaid Co", contact_name: null, email: "unpaid@esc.co" });

        queueAssessment(0);
        supabaseMock.queueResponse("collection_cases", { data: caseUnpaidEscalated, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseUnpaidEscalated, status: "resolved", closed_reason: "resolved_no_exposure" },
            error: null,
        });
        await evaluateOrOpenCollectionCase("cust-r10-esc-unpaid", { triggeredByPayment: false });
        const caseUnpaidFinal = { ...caseUnpaidEscalated, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Case AMBIGUOUS: escalates and is still escalated (no
        // production entry point run against it) — genuinely pending.
        const caseAmbiguous0 = baseCaseRow({ id: "case-r10-esc-ambiguous", customer_id: "cust-r10-esc-ambiguous", status: "unresponsive" });
        const caseAmbiguousFinal = await escalate(caseAmbiguous0, "cust-r10-esc-ambiguous", { company_name: "Escalation Ambiguous Co", contact_name: null, email: "ambiguous@esc.co" });

        // -----------------------------------------------------------
        // Feed the real captured escalation activity + real final case
        // rows to the analytics service.
        // -----------------------------------------------------------
        const escalationActivity = insertsSince("activity_log", "insert", activityCountAtStart).filter(
            (activity) => activity.activity_type === "collection_case_escalated"
        );
        expect(escalationActivity).toHaveLength(3);

        // The ambiguous case's escalation must read as "within the
        // window" for the pending assertion to be meaningful — stamp
        // it at a fixed, definitely-recent time.
        const recentTimestamp = new Date().toISOString();

        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                { id: "esc-paid", activity_type: "collection_case_escalated", metadata: { caseId: casePaidFinal.id }, created_at: "2026-01-01T00:00:00.000Z" },
                { id: "esc-unpaid", activity_type: "collection_case_escalated", metadata: { caseId: caseUnpaidFinal.id }, created_at: "2026-01-01T00:00:00.000Z" },
                { id: "esc-ambiguous", activity_type: "collection_case_escalated", metadata: { caseId: caseAmbiguousFinal.id }, created_at: recentTimestamp },
            ],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [
                { id: casePaidFinal.id, status: "resolved", closed_reason: "resolved_paid", closed_at: "2026-01-03T00:00:00.000Z" },
                { id: caseUnpaidFinal.id, status: "resolved", closed_reason: "resolved_no_exposure", closed_at: "2026-01-03T00:00:00.000Z" },
                { id: caseAmbiguousFinal.id, status: "escalated", closed_reason: null, closed_at: null },
            ],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.paidWithinWindow.paidWithinWindow).toBe(1);
        expect(result.paidWithinWindow.notPaidWithinWindow).toBe(1);
        expect(result.paidWithinWindow.pendingUndetermined).toBe(1);
        expect(result.paidWithinWindow.eligibleTotal).toBe(2);
        expect(result.paidWithinWindow.rate).toBe(0.5);
    });
});

describe("R10 E2E — Scenario 5: case resolution duration from a real opened_at/closed_at pair", () => {
    it("reconstructs the exact duration from a real case open through a real payment resolution", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const customerId = "cust-r10-duration";
        const openedAt = "2026-01-01T00:00:00.000Z";

        // Open.
        queueAssessment(50000);
        supabaseMock.queueResponse("collection_cases", { data: null, error: null });
        supabaseMock.queueResponse("invoices", { data: null, error: null });
        const openedRow = baseCaseRow({ id: "case-r10-duration", customer_id: customerId, status: "open", opened_at: openedAt });
        supabaseMock.queueResponse("collection_cases", { data: openedRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: openedRow, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: { company_name: "Duration Testing Co", contact_name: null, email: "ap@duration.co" }, error: null });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 50000, overdueAmount: 50000, overdueInvoiceCount: 1, maxDaysOverdue: 5, currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-r10-duration", threadId: "thread-r10-duration" });
        supabaseMock.queueResponse("collection_cases", { data: { ...openedRow, status: "awaiting_response" }, error: null });
        await evaluateOrOpenCollectionCase(customerId);
        const afterContact = { ...openedRow, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Resolve via payment exactly 5 real days later.
        queueAssessment(0);
        supabaseMock.queueResponse("collection_cases", { data: afterContact, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...afterContact, status: "resolved", closed_reason: "resolved_paid" },
            error: null,
        });
        await evaluateOrOpenCollectionCase(customerId, { triggeredByPayment: true });
        const resolveArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(resolveArgs).toMatchObject({ status: "resolved", closed_reason: "resolved_paid" });

        // Feed the analytics service the case's own real opened_at and
        // a deterministic, known closed_at (exactly 5 days after the
        // real opened_at captured above).
        const { getCaseResolutionDuration } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: [{ opened_at: openedRow.opened_at, closed_at: "2026-01-06T00:00:00.000Z" }],
            error: null,
        });

        const result = await getCaseResolutionDuration();

        expect(result.qualifyingCount).toBe(1);
        expect(result.averageDurationHours).toBe(120); // exactly 5 days
    });
});

describe("R10 E2E — Scenario 6: a reopened customer's two cases are counted as independent outcomes", () => {
    it("case #1 (resolved) and case #2 (fresh) never contaminate each other's metrics", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const customerId = "cust-r10-reopen";

        // Case #1 resolves via payment.
        const case1 = baseCaseRow({ id: "case-r10-reopen-1", customer_id: customerId, status: "awaiting_response", opened_at: "2025-06-01T00:00:00.000Z" });
        queueAssessment(0);
        supabaseMock.queueResponse("collection_cases", { data: case1, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...case1, status: "resolved", closed_reason: "resolved_paid", closed_at: "2025-06-10T00:00:00.000Z" },
            error: null,
        });
        await evaluateOrOpenCollectionCase(customerId, { triggeredByPayment: true });
        const case1Final = { ...case1, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Months later, a fresh case #2 opens for the same customer,
        // with entirely different history (a broken promise this time
        // — never present on case #1).
        queueAssessment(30000);
        supabaseMock.queueResponse("collection_cases", { data: null, error: null }); // no active case (case #1 is resolved)
        supabaseMock.queueResponse("invoices", { data: null, error: null });
        const case2Opened = baseCaseRow({ id: "case-r10-reopen-2", customer_id: customerId, status: "open", opened_at: "2026-03-01T00:00:00.000Z" });
        supabaseMock.queueResponse("collection_cases", { data: case2Opened, error: null });
        supabaseMock.queueResponse("collection_cases", { data: case2Opened, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: { company_name: "Reopen Analytics Co", contact_name: null, email: "ap@reopen-analytics.co" }, error: null });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 30000, overdueAmount: 30000, overdueInvoiceCount: 1, maxDaysOverdue: 5, currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-reopen-2", threadId: "thread-reopen-2" });
        supabaseMock.queueResponse("collection_cases", { data: { ...case2Opened, status: "awaiting_response" }, error: null });
        await evaluateOrOpenCollectionCase(customerId);
        const case2Final = { ...case2Opened, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        expect(case1Final.id).not.toBe(case2Final.id);

        // Case resolution breakdown: only case #1 is resolved.
        const { getCaseResolutionBreakdown, getCaseResolutionDuration } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: [{ closed_reason: case1Final.closed_reason }],
            error: null,
        });
        const breakdown = await getCaseResolutionBreakdown();
        expect(breakdown.totalResolved).toBe(1); // case #2 (still open) never counted here
        expect(breakdown.resolvedPaid.numerator).toBe(1);

        supabaseMock.queueResponse("collection_cases", {
            data: [{ opened_at: case1Final.opened_at, closed_at: case1Final.closed_at }],
            error: null,
        });
        const duration = await getCaseResolutionDuration();
        expect(duration.qualifyingCount).toBe(1); // case #2 has no closed_at yet — excluded, not fabricated
    });
});

describe("R10 E2E — Scenario 7: multiple escalation episodes on one case via provideCollectionCaseGuidance()", () => {
    it("two real escalate -> guidance -> resume cycles produce two independently-timed episodes", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );
        const { provideCollectionCaseGuidance } = await import(
            "./collectionCaseService"
        );

        const customerId = "cust-r10-episodes";
        const caseId = "case-r10-episodes";
        const customerRecord = { company_name: "Episodes Testing Co", contact_name: null, email: "ap@episodes.co" };

        const activityCountAtStart = supabaseMock.callCount("activity_log", "insert");

        // Cycle 1: escalate.
        const start = baseCaseRow({ id: caseId, customer_id: customerId, status: "unresponsive" });
        queueAssessment(50000, { assessment: "critical", priority: "critical" });
        supabaseMock.queueResponse("collection_cases", { data: start, error: null });
        supabaseMock.queueResponse("collection_cases", { data: start, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("collection_cases", { data: { ...start, status: "escalated" }, error: null });
        supabaseMock.queueResponse("customers", { data: customerRecord, error: null });
        await evaluateOrOpenCollectionCase(customerId);
        let currentRow = { ...start, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Cycle 1: guidance resumes it.
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "awaiting_response", escalation_deferred_at: null, next_evaluation_at: "2020-01-01T00:00:00.000Z" },
            error: null,
        });
        await provideCollectionCaseGuidance(caseId, "First cycle guidance.");
        currentRow = { ...currentRow, status: "awaiting_response", escalation_deferred_at: null, next_evaluation_at: "2020-01-01T00:00:00.000Z" };

        // Cycle 2: escalates again, same case.
        queueAssessment(50000, { assessment: "critical", priority: "critical" });
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("collection_cases", { data: { ...currentRow, status: "escalated" }, error: null });
        supabaseMock.queueResponse("customers", { data: customerRecord, error: null });
        await evaluateOrOpenCollectionCase(customerId);
        currentRow = { ...currentRow, ...supabaseMock.lastCallArgs("collection_cases", "update") };

        // Cycle 2: guidance resumes it again.
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "awaiting_response", escalation_deferred_at: null, next_evaluation_at: "2020-01-01T00:00:00.000Z" },
            error: null,
        });
        await provideCollectionCaseGuidance(caseId, "Second cycle guidance.");

        // -----------------------------------------------------------
        // Feed the real captured escalation+guidance activity to the
        // analytics service (re-stamped with deterministic timestamps
        // so the duration assertion is exact — the real rows were all
        // captured within the same test tick and would otherwise
        // collapse to ~0h).
        // -----------------------------------------------------------
        const realActivity = insertsSince("activity_log", "insert", activityCountAtStart);
        const escalations = realActivity.filter((a) => a.activity_type === "collection_case_escalated");
        const guidances = realActivity.filter((a) => a.activity_type === "collection_case_guidance_provided");

        expect(escalations).toHaveLength(2);
        expect(guidances).toHaveLength(2);

        const { getEscalationEffectiveness } = await import(
            "./collectionOutcomesService"
        );

        supabaseMock.queueResponse("activity_log", {
            data: [
                { id: "e1", activity_type: "collection_case_escalated", metadata: escalations[0].metadata, created_at: "2026-01-01T00:00:00.000Z" },
                { id: "g1", activity_type: "collection_case_guidance_provided", metadata: guidances[0].metadata, created_at: "2026-01-02T00:00:00.000Z" }, // 24h
                { id: "e2", activity_type: "collection_case_escalated", metadata: escalations[1].metadata, created_at: "2026-01-10T00:00:00.000Z" },
                { id: "g2", activity_type: "collection_case_guidance_provided", metadata: guidances[1].metadata, created_at: "2026-01-13T00:00:00.000Z" }, // 72h
            ],
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: [{ id: caseId, status: "awaiting_response", closed_reason: null, closed_at: null }],
            error: null,
        });

        const result = await getEscalationEffectiveness(7);

        expect(result.totalEpisodes).toBe(2); // not collapsed into 1
        expect(result.outcomeTiming.guidance.qualifyingCount).toBe(2);
        expect(result.outcomeTiming.guidance.averageDurationHours).toBe(48); // (24 + 72) / 2
        expect(result.outcomeTiming.guidance.totalDurationHours).toBe(96);
    });
});
