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

    const builder: Record<string, unknown> = {};
    const chainMethod = () => builder;

    Object.assign(builder, {
        from: chainMethod,
        select: chainMethod,
        insert: chainMethod,
        update: chainMethod,
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

describe("claimCaseForEvaluation — concurrency guard", () => {
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

        const result = await claimCaseForEvaluation("case-1");

        expect(result).not.toBeNull();
        expect(result?.id).toBe("case-1");
    });

    it("returns null when the case was already claimed by a concurrent evaluation pass (zero rows matched)", async () => {
        const { claimCaseForEvaluation } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse({ data: null, error: null });

        const result = await claimCaseForEvaluation("case-1");

        expect(result).toBeNull();
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
