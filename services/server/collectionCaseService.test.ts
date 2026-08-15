import { describe, expect, it, vi, beforeEach } from "vitest";

// FIFO-queue chainable Supabase mock — every chain method returns
// `this`; awaiting the chain (however long it is) resolves to the next
// queued response. Good enough to exercise the conditional-UPDATE /
// idempotency logic in collectionCaseService.ts without a real
// database — these tests are about verifying the RIGHT calls happen in
// the right order and the right conflict-handling branches fire, not
// about exercising Postgres itself.
function createSupabaseMock() {
    const queue: { data: unknown; error: unknown }[] = [];
    let lastUpdateArg: Record<string, unknown> | null = null;

    const builder: Record<string, unknown> = {};
    const chainMethod = () => builder;

    Object.assign(builder, {
        from: chainMethod,
        select: chainMethod,
        insert: chainMethod,
        update: (arg: Record<string, unknown>) => {
            lastUpdateArg = arg;
            return builder;
        },
        eq: chainMethod,
        neq: chainMethod,
        in: chainMethod,
        not: chainMethod,
        or: chainMethod,
        lte: chainMethod,
        gt: chainMethod,
        order: chainMethod,
        limit: chainMethod,
        maybeSingle: chainMethod,
        single: chainMethod,
        then: (
            resolve: (value: { data: unknown; error: unknown }) => void
        ) => {
            const next = queue.shift();
            resolve(next ?? { data: null, error: null });
        },
    });

    return {
        client: { from: () => builder } as unknown,
        queueResponse(response: { data: unknown; error: unknown }) {
            queue.push(response);
        },
        getLastUpdateArg() {
            return lastUpdateArg;
        },
    };
}

const supabaseMock = createSupabaseMock();

vi.mock("@/lib/supabase", () => ({
    get supabase() {
        return supabaseMock.client;
    },
}));

describe("openCollectionCase — idempotency", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("creates a new case on a clean insert", async () => {
        const { openCollectionCase } = await import("./collectionCaseService");

        supabaseMock.queueResponse({
            data: { id: "case-1", customer_id: "cust-1", status: "open" },
            error: null,
        });

        const result = await openCollectionCase("cust-1", {}, null);

        expect(result.id).toBe("case-1");
    });

    it("treats a unique-violation (23505) as an idempotent race — returns the existing active case instead of throwing", async () => {
        const { openCollectionCase } = await import("./collectionCaseService");

        // First call: the INSERT itself, which hits the partial unique
        // index (collection_cases_active_per_customer_idx) because a
        // concurrent request already created the case.
        supabaseMock.queueResponse({
            data: null,
            error: { code: "23505", message: "duplicate key value" },
        });

        // Second call: getActiveCaseForCustomer()'s fallback fetch.
        supabaseMock.queueResponse({
            data: { id: "case-existing", customer_id: "cust-1", status: "open" },
            error: null,
        });

        const result = await openCollectionCase("cust-1", {}, null);

        expect(result.id).toBe("case-existing");
    });

    it("rethrows a non-conflict database error", async () => {
        const { openCollectionCase } = await import("./collectionCaseService");

        supabaseMock.queueResponse({
            data: null,
            error: { code: "500", message: "connection reset" },
        });

        await expect(
            openCollectionCase("cust-1", {}, null)
        ).rejects.toMatchObject({ code: "500" });
    });
});

describe("claimCaseForEvaluation — optimistic-lock compare-and-swap", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the claimed row when the conditional UPDATE matches", async () => {
        const { claimCaseForEvaluation } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({
            data: { id: "case-1", status: "awaiting_response" },
            error: null,
        });

        const result = await claimCaseForEvaluation(
            "case-1",
            new Date("2026-08-14T09:00:00Z")
        );

        expect(result).not.toBeNull();
        expect(result?.id).toBe("case-1");
    });

    // Regression test for the "early customer reply silently dropped"
    // bug: claiming must succeed for a case whose next_evaluation_at is
    // still in the FUTURE (not yet due), as long as the caller's
    // expected value matches the row's actual current value — the claim
    // must never require next_evaluation_at <= now. That "due" check
    // belongs to the caller (getCasesDueForEvaluation()'s own WHERE
    // clause for the scheduled sweep), not to this compare-and-swap.
    it("claims a case whose next_evaluation_at is still in the future, given a matching expected value (event-triggered early claim)", async () => {
        const { claimCaseForEvaluation } = await import(
            "./collectionCaseService"
        );

        const future = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);

        supabaseMock.queueResponse({
            data: { id: "case-1", status: "awaiting_response" },
            error: null,
        });

        const result = await claimCaseForEvaluation("case-1", future);

        expect(result).not.toBeNull();
        expect(result?.id).toBe("case-1");
    });

    it("returns null when the case was already claimed by a concurrent evaluation pass (zero rows matched — expected value no longer matches)", async () => {
        const { claimCaseForEvaluation } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({ data: null, error: null });

        const result = await claimCaseForEvaluation(
            "case-1",
            new Date("2026-08-14T09:00:00Z")
        );

        expect(result).toBeNull();
    });

    // Two callers race to evaluate the SAME case at the same
    // next_evaluation_at snapshot (e.g. the scheduled sweep and an
    // inbound reply arriving in the same instant). Only the first
    // caller's conditional UPDATE can match the row's still-original
    // value; by the time the second caller's UPDATE runs, the first
    // already moved next_evaluation_at to its lock timestamp, so the
    // second's `.eq(expected)` no longer matches — exactly what a real
    // concurrent Postgres UPDATE ... WHERE would enforce.
    it("only one of two concurrent callers claiming the same expected value succeeds", async () => {
        const { claimCaseForEvaluation } = await import(
            "./collectionCaseService"
        );

        const expected = new Date("2026-08-14T09:00:00Z");

        // First caller's UPDATE finds a matching row.
        supabaseMock.queueResponse({
            data: { id: "case-1", status: "awaiting_response" },
            error: null,
        });

        // Second caller's UPDATE, against the same expected value, now
        // finds zero rows (the row's real next_evaluation_at was
        // already moved by the first claim).
        supabaseMock.queueResponse({ data: null, error: null });

        const [first, second] = await Promise.all([
            claimCaseForEvaluation("case-1", expected),
            claimCaseForEvaluation("case-1", expected),
        ]);

        const results = [first, second];
        const successes = results.filter((r) => r !== null);
        const failures = results.filter((r) => r === null);

        expect(successes).toHaveLength(1);
        expect(failures).toHaveLength(1);
    });
});

describe("applyCaseTransition — conflict detection", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("throws CaseTransitionConflictError when the expected status no longer matches", async () => {
        const { applyCaseTransition, CaseTransitionConflictError } =
            await import("./collectionCaseService");

        supabaseMock.queueResponse({ data: null, error: null });

        await expect(
            applyCaseTransition("case-1", "awaiting_response", {
                status: "unresponsive",
                lastDecision: "follow_up",
                lastDecisionReason: "test",
                lastDecisionAt: new Date(),
                nextEvaluationAt: new Date(),
            })
        ).rejects.toBeInstanceOf(CaseTransitionConflictError);
    });
});

describe("resolveCollectionCase — idempotent, callable even while escalated", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("returns the resolved row on success", async () => {
        const { resolveCollectionCase } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({
            data: { id: "case-1", status: "resolved", closed_reason: "resolved_paid" },
            error: null,
        });

        const result = await resolveCollectionCase("cust-1", "resolved_paid");

        expect(result?.closed_reason).toBe("resolved_paid");
    });

    it("returns null (no-op) when no non-resolved case exists — safe to call redundantly", async () => {
        const { resolveCollectionCase } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({ data: null, error: null });

        const result = await resolveCollectionCase("cust-1", "resolved_paid");

        expect(result).toBeNull();
    });
});

describe("resolveExceptionManually — Responsibility #7 human action for a non-escalated dispute/blocker", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("clears the exception (status -> resolved) and returns the case to awaiting_response when it has prior outreach", async () => {
        const { resolveExceptionManually } = await import(
            "./collectionCaseService"
        );

        // Fetch (pre-check).
        supabaseMock.queueResponse({
            data: {
                id: "case-1",
                status: "disputed",
                outreach_count: 2,
                exception_category: "dispute",
                exception_type: "amount_disputed",
            },
            error: null,
        });
        // Conditional UPDATE.
        supabaseMock.queueResponse({
            data: {
                id: "case-1",
                status: "awaiting_response",
                exception_status: "resolved",
                exception_category: "dispute",
                exception_type: "amount_disputed",
            },
            error: null,
        });

        const result = await resolveExceptionManually("case-1");

        expect(result.status).toBe("awaiting_response");
        expect(result.exception_status).toBe("resolved");
        // Category/type are deliberately preserved — WHAT was resolved
        // stays visible.
        expect(result.exception_category).toBe("dispute");
        expect(result.exception_type).toBe("amount_disputed");
    });

    it("returns the case to 'open' (not awaiting_response) when there was never any prior outreach", async () => {
        const { resolveExceptionManually } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({
            data: {
                id: "case-2",
                status: "payment_blocked",
                outreach_count: 0,
                exception_category: "blocker",
            },
            error: null,
        });
        supabaseMock.queueResponse({
            data: { id: "case-2", status: "open", exception_status: "resolved" },
            error: null,
        });

        const result = await resolveExceptionManually("case-2");

        expect(result.status).toBe("open");
    });

    it("rejects a case that is neither disputed nor payment_blocked (e.g. escalated — use markCollectionCaseResolvedManually/resumeCollectionCaseFromEscalation instead)", async () => {
        const { resolveExceptionManually } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({
            data: { id: "case-3", status: "escalated", outreach_count: 1 },
            error: null,
        });

        await expect(resolveExceptionManually("case-3")).rejects.toThrow(
            /not "disputed" or "payment_blocked"/
        );
    });

    it("throws when the case does not exist", async () => {
        const { resolveExceptionManually } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({ data: null, error: null });

        await expect(resolveExceptionManually("missing-case")).rejects.toThrow(
            /not found/
        );
    });

    it("throws a conflict error when a concurrent transition already moved the case out of disputed/payment_blocked", async () => {
        const { resolveExceptionManually, CaseTransitionConflictError } =
            await import("./collectionCaseService");

        supabaseMock.queueResponse({
            data: { id: "case-4", status: "disputed", outreach_count: 1 },
            error: null,
        });
        // The conditional UPDATE matches zero rows — status moved
        // concurrently since the fetch.
        supabaseMock.queueResponse({ data: null, error: null });

        await expect(
            resolveExceptionManually("case-4")
        ).rejects.toBeInstanceOf(CaseTransitionConflictError);
    });
});

describe("deferCollectionCaseEscalation — 'keep monitoring'", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("defers when not already deferred within the last 24 hours", async () => {
        const { deferCollectionCaseEscalation } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({
            data: { id: "case-1", status: "escalated" },
            error: null,
        });

        const result = await deferCollectionCaseEscalation("case-1");

        expect(result.outcome).toBe("deferred");
    });

    it("reports already_deferred without resetting the timer when still within the window", async () => {
        const { deferCollectionCaseEscalation } = await import(
            "./collectionCaseService"
        );

        // First: the conditional UPDATE finds no matching row (still
        // within the 24h window).
        supabaseMock.queueResponse({ data: null, error: null });

        // Second: the fallback fetch to report the existing state.
        supabaseMock.queueResponse({
            data: { id: "case-1", status: "escalated" },
            error: null,
        });

        const result = await deferCollectionCaseEscalation("case-1");

        expect(result.outcome).toBe("already_deferred");
    });
});

describe("applyCaseTransition — outbound thread anchor persistence", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("omits last_outbound_gmail_message_id/thread_id when no outboundThread patch is given (wait/escalate/resolve — no send happened)", async () => {
        const { applyCaseTransition } = await import("./collectionCaseService");

        supabaseMock.queueResponse({
            data: { id: "case-1", status: "escalated" },
            error: null,
        });

        await applyCaseTransition("case-1", "unresponsive", {
            status: "escalated",
            lastDecision: "escalate",
            lastDecisionReason: "test",
            lastDecisionAt: new Date(),
            nextEvaluationAt: new Date(),
        });

        const updateArg = supabaseMock.getLastUpdateArg();

        expect(updateArg).not.toBeNull();
        expect(updateArg).not.toHaveProperty("last_outbound_gmail_message_id");
        expect(updateArg).not.toHaveProperty("last_outbound_gmail_thread_id");
    });

    it("writes the outbound thread anchor in the SAME update as the decision field patch when a send succeeded", async () => {
        const { applyCaseTransition } = await import("./collectionCaseService");

        supabaseMock.queueResponse({
            data: { id: "case-1", status: "awaiting_response" },
            error: null,
        });

        await applyCaseTransition(
            "case-1",
            "open",
            {
                status: "awaiting_response",
                lastDecision: "contact",
                lastDecisionReason: "test",
                lastDecisionAt: new Date(),
                nextEvaluationAt: new Date(),
            },
            {
                lastOutboundGmailMessageId: "gmail-msg-1",
                lastOutboundGmailThreadId: "gmail-thread-1",
            }
        );

        const updateArg = supabaseMock.getLastUpdateArg();

        expect(updateArg).toMatchObject({
            last_outbound_gmail_message_id: "gmail-msg-1",
            last_outbound_gmail_thread_id: "gmail-thread-1",
            // Same object as the decision fields — proves this is one
            // atomic UPDATE, not a second write.
            status: "awaiting_response",
            last_decision: "contact",
        });
    });

    it("persists a null thread id (a fresh, un-threaded send) without dropping the message id", async () => {
        const { applyCaseTransition } = await import("./collectionCaseService");

        supabaseMock.queueResponse({
            data: { id: "case-1", status: "awaiting_response" },
            error: null,
        });

        await applyCaseTransition(
            "case-1",
            "open",
            {
                status: "awaiting_response",
                lastDecision: "contact",
                lastDecisionReason: "test",
                lastDecisionAt: new Date(),
                nextEvaluationAt: new Date(),
            },
            {
                lastOutboundGmailMessageId: "gmail-msg-1",
                lastOutboundGmailThreadId: null,
            }
        );

        const updateArg = supabaseMock.getLastUpdateArg();

        expect(updateArg?.last_outbound_gmail_message_id).toBe("gmail-msg-1");
        expect(updateArg?.last_outbound_gmail_thread_id).toBeNull();
    });
});
