import { describe, expect, it, vi, beforeEach } from "vitest";

// Per-table FIFO queue mock — unlike collectionCaseService.test.ts's
// single-queue mock, this service queries three different tables
// (collection_cases, activity_log, emails) in one call, so each table
// needs its own independent queue.
function createSupabaseMock() {
    const queues: Record<string, { data: unknown; error: unknown }[]> = {};

    function builderFor(table: string) {
        const builder: Record<string, unknown> = {};
        const chainMethod = () => builder;

        Object.assign(builder, {
            select: chainMethod,
            eq: chainMethod,
            in: chainMethod,
            gte: chainMethod,
            order: chainMethod,
            limit: chainMethod,
            maybeSingle: chainMethod,
            then: (
                resolve: (value: { data: unknown; error: unknown }) => void
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
            response: { data: unknown; error: unknown }
        ) {
            queues[table] = queues[table] ?? [];
            queues[table].push(response);
        },
    };
}

const supabaseMock = createSupabaseMock();

vi.mock("@/lib/supabase", () => ({
    get supabase() {
        return supabaseMock.client;
    },
}));

describe("getCollectionCaseList", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it("maps snake_case rows (with nested customer) into CollectionCaseSummary", async () => {
        const { getCollectionCaseList } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: [
                {
                    id: "case-1",
                    customer_id: "cust-1",
                    status: "awaiting_response",
                    opened_at: "2026-08-01T00:00:00Z",
                    closed_at: null,
                    closed_reason: null,
                    last_decision: "contact",
                    last_decision_reason: "First contact sent.",
                    last_action_at: "2026-08-01T00:00:00Z",
                    next_evaluation_at: "2026-08-05T00:00:00Z",
                    outreach_count: 1,
                    unanswered_outreach_count: 1,
                    last_outreach_at: "2026-08-01T00:00:00Z",
                    broken_promise_count: 0,
                    promise_status: null,
                    promise_date: null,
                    exception_category: null,
                    exception_status: null,
                    escalated_at: null,
                    updated_at: "2026-08-01T00:00:00Z",
                    customers: { company_name: "Acme Corp" },
                },
            ],
            error: null,
        });

        const result = await getCollectionCaseList();

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            id: "case-1",
            customerId: "cust-1",
            customerName: "Acme Corp",
            status: "awaiting_response",
            outreachCount: 1,
        });
    });

    it("falls back to a placeholder name when the customer join is missing", async () => {
        const { getCollectionCaseList } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: [
                {
                    id: "case-2",
                    customer_id: "cust-2",
                    status: "open",
                    opened_at: "2026-08-01T00:00:00Z",
                    closed_at: null,
                    closed_reason: null,
                    last_decision: null,
                    last_decision_reason: null,
                    last_action_at: null,
                    next_evaluation_at: "2026-08-05T00:00:00Z",
                    outreach_count: 0,
                    unanswered_outreach_count: 0,
                    last_outreach_at: null,
                    broken_promise_count: 0,
                    promise_status: null,
                    promise_date: null,
                    exception_category: null,
                    exception_status: null,
                    escalated_at: null,
                    updated_at: "2026-08-01T00:00:00Z",
                    customers: null,
                },
            ],
            error: null,
        });

        const result = await getCollectionCaseList();

        expect(result[0].customerName).toBe("Unknown customer");
    });

    it("rethrows a database error", async () => {
        const { getCollectionCaseList } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: null,
            error: { message: "connection reset" },
        });

        await expect(getCollectionCaseList()).rejects.toMatchObject({
            message: "connection reset",
        });
    });
});

describe("getCollectionCaseDetail", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    function queueCaseRow() {
        supabaseMock.queueResponse("collection_cases", {
            data: {
                id: "case-1",
                customer_id: "cust-1",
                status: "awaiting_response",
                opened_at: "2026-08-01T00:00:00Z",
                closed_at: null,
                closed_reason: null,
                last_decision: "contact",
                last_decision_reason: "First contact sent.",
                last_action_at: "2026-08-01T00:00:00Z",
                next_evaluation_at: "2026-08-05T00:00:00Z",
                outreach_count: 1,
                unanswered_outreach_count: 1,
                last_outreach_at: "2026-08-01T00:00:00Z",
                broken_promise_count: 0,
                promise_status: null,
                promise_date: null,
                exception_category: null,
                exception_status: null,
                escalated_at: null,
                updated_at: "2026-08-01T00:00:00Z",
                triggering_invoice_id: "inv-1",
                promise_amount: null,
                promise_currency: null,
                exception_type: null,
                exception_detail: null,
                escalation_reason: null,
                customers: {
                    company_name: "Acme Corp",
                    contact_name: "Jane Doe",
                    email: "jane@acme.test",
                },
                invoices: { invoice_number: "INV-1001" },
            },
            error: null,
        });
    }

    it("returns null when the case does not exist", async () => {
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: null,
            error: null,
        });

        const result = await getCollectionCaseDetail("missing-case");

        expect(result).toBeNull();
    });

    it("merges outbound (activity_log, scoped to this case's metadata.caseId) and inbound (emails) entries in chronological order", async () => {
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        queueCaseRow();

        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-1",
                    activity_type: "collection_outreach_sent",
                    description: "Customer has an overdue balance; initiating first contact.",
                    metadata: {
                        caseId: "case-1",
                        subject: "Outstanding balance on your account",
                        body: "Hi Jane, ...",
                    },
                    created_at: "2026-08-01T10:00:00Z",
                },
                {
                    id: "activity-2",
                    activity_type: "collection_case_opened",
                    description: "Collection case opened for needs_attention customer.",
                    // No subject/body — a lifecycle event, not a send.
                    metadata: { caseId: "case-1" },
                    created_at: "2026-08-01T09:00:00Z",
                },
                {
                    id: "activity-other-case",
                    activity_type: "collection_outreach_sent",
                    description: "Belongs to a different, earlier case for the same customer.",
                    metadata: { caseId: "some-other-case" },
                    created_at: "2026-07-01T09:00:00Z",
                },
            ],
            error: null,
        });

        supabaseMock.queueResponse("emails", {
            data: [
                {
                    id: "email-1",
                    subject: "Re: Outstanding balance on your account",
                    text_body: "We'll pay by Friday.",
                    received_at: "2026-08-02T08:00:00Z",
                    classification: "payment_promise",
                },
            ],
            error: null,
        });

        const result = await getCollectionCaseDetail("case-1");

        expect(result).not.toBeNull();
        expect(result?.customerName).toBe("Acme Corp");
        expect(result?.triggeringInvoiceNumber).toBe("INV-1001");

        // The other case's activity row must never appear.
        const ids = result?.communicationHistory.map((entry) => entry.id);
        expect(ids).not.toContain("activity-other-case");
        expect(ids).toEqual(["activity-2", "activity-1", "email-1"]);

        const outreachEntry = result?.communicationHistory.find(
            (entry) => entry.id === "activity-1"
        );
        expect(outreachEntry?.direction).toBe("outbound");
        expect(outreachEntry?.subject).toBe("Outstanding balance on your account");

        const lifecycleEntry = result?.communicationHistory.find(
            (entry) => entry.id === "activity-2"
        );
        expect(lifecycleEntry?.subject).toBeNull();
        expect(lifecycleEntry?.body).toBe(
            "Collection case opened for needs_attention customer."
        );

        const inboundEntry = result?.communicationHistory.find(
            (entry) => entry.id === "email-1"
        );
        expect(inboundEntry?.direction).toBe("inbound");
        expect(inboundEntry?.classification).toBe("payment_promise");
    });
});
