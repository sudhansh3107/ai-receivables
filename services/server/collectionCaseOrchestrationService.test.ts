import { describe, expect, it, vi, beforeEach } from "vitest";
import type {
    CollectionDecisionResult,
    OutreachContext,
} from "./collectionDecisionEngine";

// Per-table FIFO queue mock — same pattern as
// collectionCaseDashboardService.test.ts, needed here (rather than the
// single-queue style in collectionCaseService.test.ts) because
// evaluateOrOpenCollectionCase() queries several different tables in
// one call.
interface RecordedCall {
    method: string;
    args: unknown[];
}

function createSupabaseMock() {
    const queues: Record<string, { data: unknown; error: unknown; count?: number }[]> = {};
    const callLog: Record<string, RecordedCall[]> = {};

    function builderFor(table: string) {
        const builder: Record<string, unknown> = {};
        callLog[table] = callLog[table] ?? [];

        // Records every chain call (method name + args) for this table
        // — needed to assert exactly which WHERE conditions a query
        // used (e.g. .eq("next_evaluation_at", x) vs the old
        // .lte("next_evaluation_at", now)), not just what it returned.
        const recordingChainMethod = (method: string) => (...args: unknown[]) => {
            callLog[table].push({ method, args });
            return builder;
        };

        Object.assign(builder, {
            select: recordingChainMethod("select"),
            eq: recordingChainMethod("eq"),
            neq: recordingChainMethod("neq"),
            not: recordingChainMethod("not"),
            lte: recordingChainMethod("lte"),
            update: recordingChainMethod("update"),
            maybeSingle: recordingChainMethod("maybeSingle"),
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
        reset() {
            for (const key of Object.keys(queues)) delete queues[key];
            for (const key of Object.keys(callLog)) delete callLog[key];
        },
    };
}

const supabaseMock = createSupabaseMock();

// This file's imports pull in `@/lib/supabase` transitively (via
// collectionCaseService.ts) and the real Gmail client (via
// lib/gmail/send.ts / lib/gmail/messages.ts) — all mocked below so
// these tests never touch a real database or network, mirroring
// collectionCaseService.test.ts's existing mocking discipline.
vi.mock("@/lib/supabase", () => ({
    get supabase() {
        return supabaseMock.client;
    },
}));

// The orchestration module transitively imports
// promisePaymentExtractionService.ts/collectionExceptionExtractionService.ts
// (via paymentEmailMatchingService.ts's own import chain), which
// construct an OpenAI client at module-load time — mocked here purely
// so the module graph can load in a test environment with no
// OPENAI_API_KEY; none of these tests exercise AI extraction.
vi.mock("@/lib/openai", () => ({
    openai: {},
}));

const sendGmailReplyMock = vi.fn();
const getOriginalMessageMetadataMock = vi.fn();
const logActivityMock = vi.fn();
const logEmployeeActivityMock = vi.fn();
const getOverdueInvoiceDetailMock = vi.fn();

vi.mock("@/lib/gmail/send", () => ({
    sendGmailReply: (...args: unknown[]) => sendGmailReplyMock(...args),
}));

vi.mock("@/lib/gmail/messages", () => ({
    getOriginalMessageMetadata: (...args: unknown[]) =>
        getOriginalMessageMetadataMock(...args),
}));

vi.mock("./activityLogService", () => ({
    logActivity: (...args: unknown[]) => logActivityMock(...args),
}));

vi.mock("./receivablesMonitoringService", () => ({
    getOverdueInvoiceDetail: (...args: unknown[]) =>
        getOverdueInvoiceDetailMock(...args),
}));

vi.mock("../EmployeeActivityService", () => ({
    logEmployeeActivity: (...args: unknown[]) => logEmployeeActivityMock(...args),
}));

// Responsibility #5 (Understand Customer Responses) — the "structured
// understanding" step for handleCollectionRelevantEmail() tests below.
// Mocked directly (rather than letting them hit the mocked-empty
// `openai` object) so each test can assert exactly what input the
// extraction was called with and control exactly what evidence it
// returns.
const extractPromiseDetailsMock = vi.fn();
const extractExceptionDetailsMock = vi.fn();

vi.mock("./promisePaymentExtractionService", () => ({
    extractPromiseDetails: (...args: unknown[]) =>
        extractPromiseDetailsMock(...args),
}));

vi.mock("./collectionExceptionExtractionService", () => ({
    extractExceptionDetails: (...args: unknown[]) =>
        extractExceptionDetailsMock(...args),
}));

describe("sendProactiveOutreach — outbound thread continuity", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        sendGmailReplyMock.mockReset();
        getOriginalMessageMetadataMock.mockReset();
    });

    it("sends a fresh, un-threaded email when no anchor exists (a case's first-ever contact)", async () => {
        const { sendProactiveOutreach } = await import(
            "./collectionCaseOrchestrationService"
        );

        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "new-msg",
            threadId: "new-thread",
        });

        const result = await sendProactiveOutreach(
            "customer@example.com",
            { subject: "Outstanding balance", body: "Hi there" },
            null
        );

        expect(getOriginalMessageMetadataMock).not.toHaveBeenCalled();
        expect(sendGmailReplyMock).toHaveBeenCalledWith({
            to: "customer@example.com",
            subject: "Outstanding balance",
            body: "Hi there",
        });
        expect(result).toEqual({ messageId: "new-msg", threadId: "new-thread" });
    });

    it("threads onto the case's own anchor when one exists and the RFC Message-ID resolves", async () => {
        const { sendProactiveOutreach } = await import(
            "./collectionCaseOrchestrationService"
        );

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "abc123@mail.gmail.com",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "follow-up-msg",
            threadId: "existing-thread",
        });

        const result = await sendProactiveOutreach(
            "customer@example.com",
            { subject: "Following up", body: "Hi again" },
            { messageId: "prior-msg", threadId: "existing-thread" }
        );

        expect(getOriginalMessageMetadataMock).toHaveBeenCalledWith("prior-msg");
        expect(sendGmailReplyMock).toHaveBeenCalledWith({
            to: "customer@example.com",
            subject: "Following up",
            body: "Hi again",
            threadId: "existing-thread",
            inReplyTo: "abc123@mail.gmail.com",
            references: "abc123@mail.gmail.com",
        });
        expect(result).toEqual({
            messageId: "follow-up-msg",
            threadId: "existing-thread",
        });
    });

    it("falls back to a fresh email when the anchor message has no RFC Message-ID header (degrades gracefully, never blocks the send)", async () => {
        const { sendProactiveOutreach } = await import(
            "./collectionCaseOrchestrationService"
        );

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: null,
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "fallback-msg",
            threadId: "fallback-thread",
        });

        const result = await sendProactiveOutreach(
            "customer@example.com",
            { subject: "Following up", body: "Hi again" },
            { messageId: "prior-msg", threadId: "existing-thread" }
        );

        expect(sendGmailReplyMock).toHaveBeenCalledWith({
            to: "customer@example.com",
            subject: "Following up",
            body: "Hi again",
        });
        expect(result).toEqual({
            messageId: "fallback-msg",
            threadId: "fallback-thread",
        });
    });

    it("propagates a genuine failure to fetch the anchor message (never silently falls back on a real error)", async () => {
        const { sendProactiveOutreach } = await import(
            "./collectionCaseOrchestrationService"
        );

        getOriginalMessageMetadataMock.mockRejectedValueOnce(
            new Error("Gmail API unavailable")
        );

        await expect(
            sendProactiveOutreach(
                "customer@example.com",
                { subject: "Following up", body: "Hi again" },
                { messageId: "prior-msg", threadId: "existing-thread" }
            )
        ).rejects.toThrow("Gmail API unavailable");

        expect(sendGmailReplyMock).not.toHaveBeenCalled();
    });
});

function makeResult(
    overrides: Partial<CollectionDecisionResult> = {}
): Pick<CollectionDecisionResult, "decision" | "outreachContext"> {
    return {
        decision: "follow_up",
        outreachContext: undefined,
        ...overrides,
    };
}

describe("selectOutreachActivityType — pure", () => {
    it("maps acknowledge_promise to COLLECTION_PROMISE_ACKNOWLEDGED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "acknowledge_promise" })
            )
        ).toBe("collection_promise_acknowledged");
    });

    it("maps acknowledge_exception to COLLECTION_DISPUTE_OPENED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "acknowledge_exception" })
            )
        ).toBe("collection_dispute_opened");
    });

    // Responsibility #7 — revised dispute acknowledgment.
    it("maps a REVISED dispute acknowledgment to COLLECTION_DISPUTE_REVISED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "acknowledge_exception",
            category: "dispute",
            wasRevision: true,
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "acknowledge_exception", outreachContext })
            )
        ).toBe("collection_dispute_revised");
    });

    it("maps a fresh (non-revision) dispute acknowledgment to COLLECTION_DISPUTE_OPENED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "acknowledge_exception",
            category: "dispute",
            wasRevision: false,
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "acknowledge_exception", outreachContext })
            )
        ).toBe("collection_dispute_opened");
    });

    it("maps a broken-promise follow_up (missedCommitment set) to COLLECTION_PROMISE_BROKEN", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "follow_up",
            missedCommitment: { amount: 5000, currency: "INR", date: "2026-08-01" },
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "follow_up", outreachContext })
            )
        ).toBe("collection_promise_broken");
    });

    it("maps an ordinary silence-triggered follow_up (missedCommitment null) to COLLECTION_OUTREACH_SENT", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "follow_up",
            missedCommitment: null,
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "follow_up", outreachContext })
            )
        ).toBe("collection_outreach_sent");
    });

    it("maps contact/check_in to COLLECTION_OUTREACH_SENT", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "contact", outreachContext: { kind: "contact" } })
            )
        ).toBe("collection_outreach_sent");

        expect(
            selectOutreachActivityType(
                makeResult({
                    decision: "check_in",
                    outreachContext: { kind: "check_in" },
                })
            )
        ).toBe("collection_outreach_sent");
    });

    // Responsibility #6 — the explicit promiseOutcome/wasRevision
    // discriminants take precedence over any legacy inference.
    it("maps a fulfilled-promise follow_up to COLLECTION_PROMISE_FULFILLED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "follow_up",
            missedCommitment: null,
            promiseOutcome: "fulfilled",
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "follow_up", outreachContext })
            )
        ).toBe("collection_promise_fulfilled");
    });

    it("maps a partially-fulfilled promise follow_up to COLLECTION_PROMISE_PARTIALLY_FULFILLED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "follow_up",
            missedCommitment: { amount: 10000, currency: "INR", date: "2026-08-01" },
            promiseOutcome: "partial",
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "follow_up", outreachContext })
            )
        ).toBe("collection_promise_partially_fulfilled");
    });

    it("maps a promiseOutcome='broken' follow_up to COLLECTION_PROMISE_BROKEN via the explicit discriminant (not just missedCommitment inference)", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "follow_up",
            missedCommitment: { amount: 10000, currency: "INR", date: "2026-08-01" },
            promiseOutcome: "broken",
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "follow_up", outreachContext })
            )
        ).toBe("collection_promise_broken");
    });

    it("maps a REVISED promise acceptance to COLLECTION_PROMISE_REVISED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "acknowledge_promise",
            amount: 60000,
            currency: "INR",
            date: "2026-09-10",
            wasRevision: true,
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "acknowledge_promise", outreachContext })
            )
        ).toBe("collection_promise_revised");
    });

    it("maps a fresh (non-revision) promise acceptance to COLLECTION_PROMISE_ACKNOWLEDGED", async () => {
        const { selectOutreachActivityType } = await import(
            "./collectionCaseOrchestrationService"
        );

        const outreachContext: OutreachContext = {
            kind: "acknowledge_promise",
            amount: 15000,
            currency: "INR",
            date: "2026-09-05",
            wasRevision: false,
        };

        expect(
            selectOutreachActivityType(
                makeResult({ decision: "acknowledge_promise", outreachContext })
            )
        ).toBe("collection_promise_acknowledged");
    });
});

describe("isNewBlockerOpened — pure", () => {
    it("is true when a wait decision moves status into payment_blocked from a different prior status", async () => {
        const { isNewBlockerOpened } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isNewBlockerOpened(
                { decision: "wait", newStatus: "payment_blocked" },
                "awaiting_response"
            )
        ).toBe(true);
    });

    it("is false when the case was already payment_blocked (re-statement, not a new blocker)", async () => {
        const { isNewBlockerOpened } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isNewBlockerOpened(
                { decision: "wait", newStatus: "payment_blocked" },
                "payment_blocked"
            )
        ).toBe(false);
    });

    it("is false for any non-wait decision", async () => {
        const { isNewBlockerOpened } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isNewBlockerOpened(
                { decision: "escalate", newStatus: "payment_blocked" },
                "awaiting_response"
            )
        ).toBe(false);
    });
});

describe("isBlockerRevised — pure (Responsibility #7)", () => {
    it("is true for a 'wait' decision into payment_blocked with evidence.wasRevision=true", async () => {
        const { isBlockerRevised } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isBlockerRevised({
                decision: "wait",
                newStatus: "payment_blocked",
                evidence: { wasRevision: true },
            })
        ).toBe(true);
    });

    it("is false for a fresh blocker (evidence.wasRevision=false) — that case belongs to isNewBlockerOpened() instead", async () => {
        const { isBlockerRevised } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isBlockerRevised({
                decision: "wait",
                newStatus: "payment_blocked",
                evidence: { wasRevision: false },
            })
        ).toBe(false);
    });

    it("is false for any non-wait decision, even with wasRevision evidence present", async () => {
        const { isBlockerRevised } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isBlockerRevised({
                decision: "check_in",
                newStatus: "payment_blocked",
                evidence: { wasRevision: true },
            })
        ).toBe(false);
    });

    it("is false when newStatus isn't payment_blocked", async () => {
        const { isBlockerRevised } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isBlockerRevised({
                decision: "wait",
                newStatus: "disputed",
                evidence: { wasRevision: true },
            })
        ).toBe(false);
    });
});

describe("isExceptionResolved — pure", () => {
    it("is true when the field patch resolves an exception the case actually had", async () => {
        const { isExceptionResolved } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(isExceptionResolved({ exceptionStatus: "resolved" }, true)).toBe(
            true
        );
    });

    it("is false when the case never had an exception open (nothing to resolve)", async () => {
        const { isExceptionResolved } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(isExceptionResolved({ exceptionStatus: "resolved" }, false)).toBe(
            false
        );
    });

    it("is false when the patch doesn't resolve the exception (e.g. routed_to_human)", async () => {
        const { isExceptionResolved } = await import(
            "./collectionCaseOrchestrationService"
        );

        expect(
            isExceptionResolved({ exceptionStatus: "routed_to_human" }, true)
        ).toBe(false);
    });
});

// ---------------------------------------------------------------------
// Regression tests for the claim/schedule bug found during live E2E
// verification: claimCaseForEvaluation() previously used
// `.lte("next_evaluation_at", now)`, which (a) fed the decision engine
// the claim's own freshly-set lock timestamp instead of the case's real
// prior schedule (permanently defeating the awaiting_response/
// disputed/payment_blocked "has my window expired" checks), and (b)
// caused the claim itself to fail — silently dropping the evaluation —
// whenever an event-triggered call (a reply, a payment) arrived before
// the case's next_evaluation_at, which is the NORMAL case for a prompt
// reply. Both are fixed by making the claim a true optimistic-lock
// compare-and-swap against the exact next_evaluation_at value the
// caller already read, and by building CaseState from that same
// pre-claim value rather than the claim's own return.
// ---------------------------------------------------------------------

// The mock resolves by table + call-order, not by filter value, so no
// customerId parameter is needed here.
function queueBaselineAssessment() {
    supabaseMock.queueResponse("customer_receivables_assessments", {
        data: {
            assessment: "needs_attention",
            priority: "medium",
            severity: "elevated",
            deviation: "unknown",
            reason: "Test overdue balance.",
            evidence: { outstandingAmount: 50000 },
        },
        error: null,
    });
}

describe("evaluateOrOpenCollectionCase — claim/schedule regression", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        sendGmailReplyMock.mockReset();
        getOriginalMessageMetadataMock.mockReset();
        logActivityMock.mockReset();
        logEmployeeActivityMock.mockReset();
        getOverdueInvoiceDetailMock.mockReset();
        supabaseMock.reset();
    });

    it("Bug A — an overdue awaiting_response case is no longer forced into 'wait' by the claim's own lock timestamp", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const customerId = "cust-bug-a";
        const farPast = "2020-01-01T00:00:00.000Z"; // the case's REAL, genuinely-overdue schedule
        const claimLockAbsurdFuture = "2099-01-01T00:00:00.000Z"; // what the claim's UPDATE would return — deliberately absurd so the test fails loudly if the code ever reads this value instead of the pre-claim one

        queueBaselineAssessment();

        const baseCaseRow = {
            id: "case-bug-a",
            customer_id: customerId,
            status: "awaiting_response",
            opened_at: "2026-01-01T00:00:00.000Z",
            closed_at: null,
            closed_reason: null,
            triggering_invoice_id: null,
            opening_assessment_snapshot: {},
            last_decision: "contact",
            last_decision_reason: "First contact sent.",
            last_decision_at: farPast,
            last_action_at: farPast,
            next_evaluation_at: farPast,
            outreach_count: 1,
            unanswered_outreach_count: 1,
            last_outreach_at: farPast,
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
            exception_category: null,
            exception_type: null,
            exception_status: null,
            exception_detail: null,
            exception_source_email_id: null,
            exception_opened_at: null,
            escalated_at: null,
            escalation_reason: null,
            escalation_evidence: null,
            escalation_deferred_at: null,
            last_outbound_gmail_message_id: null,
            last_outbound_gmail_thread_id: null,
        };

        // getActiveCaseForCustomer() — the pre-claim read.
        supabaseMock.queueResponse("collection_cases", {
            data: baseCaseRow,
            error: null,
        });

        // claimCaseForEvaluation()'s own UPDATE...RETURNING — simulates
        // exactly what the real claim does: overwrite next_evaluation_at
        // to a future lock timestamp. If the bug were present, THIS is
        // the value the decision engine would incorrectly see.
        supabaseMock.queueResponse("collection_cases", {
            data: { ...baseCaseRow, next_evaluation_at: claimLockAbsurdFuture },
            error: null,
        });

        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "moderate" },
            error: null,
        });

        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });

        supabaseMock.queueResponse("customers", {
            data: {
                company_name: "Acme Co",
                contact_name: null,
                email: "acme@example.com",
            },
            error: null,
        });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 50000,
            overdueAmount: 50000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 10,
            currency: "INR",
        });

        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-followup",
            threadId: "thread-followup",
        });

        // applyCaseTransition() after a successful send.
        supabaseMock.queueResponse("collection_cases", {
            data: { ...baseCaseRow, status: "unresponsive" },
            error: null,
        });

        await evaluateOrOpenCollectionCase(customerId);

        // If the bug were present, the case would have been forced into
        // "wait" and NEITHER of these would ever fire.
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);
        expect(logActivityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                activityType: "collection_outreach_sent",
            })
        );

        const loggedCall = logActivityMock.mock.calls.find(
            (call) => call[0]?.activityType === "collection_outreach_sent"
        );
        expect(loggedCall?.[0]?.description).not.toMatch(
            /window has not expired/i
        );

        // The claim itself must have been asked for the REAL prior
        // schedule (farPast), never "now".
        const claimCall = supabaseMock
            .getCalls("collection_cases")
            .find((call) => call.method === "eq" && call.args[0] === "next_evaluation_at");
        expect(claimCall?.args[1]).toBe(farPast);
    });

    it("Bug B — a customer reply arriving before next_evaluation_at is still evaluated, not silently dropped", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const customerId = "cust-bug-b";
        const farFuture = "2030-01-01T00:00:00.000Z"; // not yet due — the exact scenario the old .lte(now) claim would reject

        queueBaselineAssessment();

        const baseCaseRow = {
            id: "case-bug-b",
            customer_id: customerId,
            status: "awaiting_response",
            opened_at: "2026-01-01T00:00:00.000Z",
            closed_at: null,
            closed_reason: null,
            triggering_invoice_id: null,
            opening_assessment_snapshot: {},
            last_decision: "contact",
            last_decision_reason: "First contact sent.",
            last_decision_at: "2026-01-01T00:00:00.000Z",
            last_action_at: "2026-01-01T00:00:00.000Z",
            next_evaluation_at: farFuture,
            outreach_count: 1,
            unanswered_outreach_count: 1,
            last_outreach_at: "2026-01-01T00:00:00.000Z",
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
            exception_category: null,
            exception_type: null,
            exception_status: null,
            exception_detail: null,
            exception_source_email_id: null,
            exception_opened_at: null,
            escalated_at: null,
            escalation_reason: null,
            escalation_evidence: null,
            escalation_deferred_at: null,
            last_outbound_gmail_message_id: null,
            last_outbound_gmail_thread_id: null,
        };

        supabaseMock.queueResponse("collection_cases", {
            data: baseCaseRow,
            error: null,
        });

        // claimCaseForEvaluation() succeeding for a not-yet-due case is
        // exactly the fixed behavior under test.
        supabaseMock.queueResponse("collection_cases", {
            data: baseCaseRow,
            error: null,
        });

        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "moderate" },
            error: null,
        });

        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });

        supabaseMock.queueResponse("customers", {
            data: {
                company_name: "Acme Co",
                contact_name: null,
                email: "acme@example.com",
            },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "rfc-abc@mail.gmail.com",
        });

        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-ack",
            threadId: "thread-original",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...baseCaseRow, status: "promise_to_pay" },
            error: null,
        });

        await evaluateOrOpenCollectionCase(customerId, {
            latestResponse: {
                emailId: "email-1",
                classification: "payment_promise",
                classificationConfidence: 0.95,
                receivedAt: new Date(),
                promiseExtraction: {
                    intentClear: true,
                    amountStated: true,
                    amount: 50000,
                    currency: "INR",
                    promiseDate: "2026-09-01",
                    confidence: 0.95,
                },
            },
            replySource: {
                gmailMessageId: "inbound-msg-1",
                gmailThreadId: "thread-original",
                fromEmail: "acme@example.com",
                subject: "Re: Outstanding balance on your account",
            },
        });

        // If the bug were present, claimCaseForEvaluation() would have
        // rejected this not-yet-due case and evaluateOrOpenCollectionCase
        // would have returned silently — nothing below would ever fire.
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);
        expect(logActivityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                activityType: "collection_promise_acknowledged",
            })
        );

        // The claim must have been asked for the REAL prior schedule
        // (farFuture) — proving it does NOT require next_evaluation_at
        // <= now.
        const claimCall = supabaseMock
            .getCalls("collection_cases")
            .find((call) => call.method === "eq" && call.args[0] === "next_evaluation_at");
        expect(claimCall?.args[1]).toBe(farFuture);
    });
});

// ---------------------------------------------------------------------
// Responsibility #5 (Understand Customer Responses) — handleCollectionRelevantEmail()
// end-to-end: relevance/classification have already happened upstream
// (emailProcessingService.ts); this is deterministic customer
// resolution, structured-understanding extraction dispatch, and
// case linkage/persistence for realistic response types and the two
// "fail safe, never guess" edge cases (ambiguous sender, no active
// case).
// ---------------------------------------------------------------------

function baseCollectionCaseRow(
    overrides: Record<string, unknown> = {}
) {
    return {
        id: "case-r5",
        customer_id: "cust-r5",
        status: "awaiting_response",
        opened_at: "2026-08-01T00:00:00.000Z",
        closed_at: null,
        closed_reason: null,
        triggering_invoice_id: null,
        opening_assessment_snapshot: {},
        last_decision: "contact",
        last_decision_reason: "First contact sent.",
        last_decision_at: "2026-08-01T00:00:00.000Z",
        last_action_at: "2026-08-01T00:00:00.000Z",
        next_evaluation_at: "2020-01-01T00:00:00.000Z",
        outreach_count: 1,
        unanswered_outreach_count: 1,
        last_outreach_at: "2026-08-01T00:00:00.000Z",
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
        exception_category: null,
        exception_type: null,
        exception_status: null,
        exception_detail: null,
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

function queueR5Assessment() {
    supabaseMock.queueResponse("customer_receivables_assessments", {
        data: {
            assessment: "needs_attention",
            priority: "medium",
            severity: "elevated",
            deviation: "unknown",
            reason: "Test overdue balance.",
            evidence: { outstandingAmount: 75000 },
        },
        error: null,
    });
}

describe("handleCollectionRelevantEmail — understand customer responses", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        sendGmailReplyMock.mockReset();
        getOriginalMessageMetadataMock.mockReset();
        logActivityMock.mockReset();
        logEmployeeActivityMock.mockReset();
        getOverdueInvoiceDetailMock.mockReset();
        extractPromiseDetailsMock.mockReset();
        extractExceptionDetailsMock.mockReset();
        supabaseMock.reset();
    });

    it("payment_promise: extracts structured evidence, links to the customer's active case, and persists it", async () => {
        const { handleCollectionRelevantEmail } = await import(
            "./collectionCaseOrchestrationService"
        );

        // findCustomerByEmailSafe()
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r5", company_name: "Acme Co", email: "acme@example.com" },
            error: null,
        });

        // handleCollectionRelevantEmail's own getActiveCaseForCustomer()
        const caseRow = baseCollectionCaseRow();
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true,
            amountStated: true,
            amount: 75000,
            currency: "INR",
            promiseDate: "2026-09-01",
            confidence: 0.92,
        });

        queueR5Assessment();
        // evaluateOrOpenCollectionCase's own getActiveCaseForCustomer()
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        // claimCaseForEvaluation()
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "moderate" },
            error: null,
        });
        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });
        // getCustomerContact()
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Acme Co", contact_name: null, email: "acme@example.com" },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "rfc-promise@mail.gmail.com",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-ack-promise",
            threadId: "thread-r5",
        });

        // applyCaseTransition()
        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "promise_to_pay" },
            error: null,
        });

        await handleCollectionRelevantEmail({
            id: "email-r5-promise",
            subject: "Re: Outstanding balance",
            text_body: "We will pay the full amount by Sept 1st.",
            from_email: "acme@example.com",
            classification: "payment_promise",
            classification_confidence: 0.9,
            gmail_message_id: "inbound-r5-promise",
            gmail_thread_id: "thread-r5",
        });

        // Structured understanding: extraction was actually invoked with
        // the email's own content, not re-derived from the classification
        // alone.
        expect(extractPromiseDetailsMock).toHaveBeenCalledWith({
            subject: "Re: Outstanding balance",
            textBody: "We will pay the full amount by Sept 1st.",
        });
        expect(extractExceptionDetailsMock).not.toHaveBeenCalled();

        // Deterministic customer linkage: the email row itself is
        // attributed to the resolved customer.
        const emailsUpdateCall = supabaseMock
            .getCalls("emails")
            .find((call) => call.method === "update");
        expect(emailsUpdateCall?.args[0]).toMatchObject({
            customer_id: "cust-r5",
        });

        // Evidence/confidence flowed through to a persisted case
        // transition and an auditable activity entry.
        expect(logActivityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                activityType: "collection_promise_acknowledged",
                metadata: expect.objectContaining({
                    promiseAmount: 75000,
                    promiseCurrency: "INR",
                    promiseDate: "2026-09-01",
                    promiseConfidence: 0.92,
                }),
            })
        );
    });

    it("dispute: dispatches exception extraction with category=dispute and persists the resulting evidence", async () => {
        const { handleCollectionRelevantEmail } = await import(
            "./collectionCaseOrchestrationService"
        );

        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r5b", company_name: "Beta Ltd", email: "beta@example.com" },
            error: null,
        });

        const caseRow = baseCollectionCaseRow({
            id: "case-r5b",
            customer_id: "cust-r5b",
        });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "invoice_incorrect",
            detail: "Customer says the invoiced quantity is wrong.",
            confidence: 0.85,
        });

        queueR5Assessment();
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "low" },
            error: null,
        });
        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Beta Ltd", contact_name: null, email: "beta@example.com" },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "rfc-dispute@mail.gmail.com",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-ack-dispute",
            threadId: "thread-r5b",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "disputed" },
            error: null,
        });

        await handleCollectionRelevantEmail({
            id: "email-r5-dispute",
            subject: "Invoice amount is wrong",
            text_body: "The quantity billed does not match what we received.",
            from_email: "beta@example.com",
            classification: "dispute",
            classification_confidence: 0.88,
            gmail_message_id: "inbound-r5-dispute",
            gmail_thread_id: "thread-r5b",
        });

        expect(extractExceptionDetailsMock).toHaveBeenCalledWith({
            subject: "Invoice amount is wrong",
            textBody: "The quantity billed does not match what we received.",
            category: "dispute",
        });
        expect(extractPromiseDetailsMock).not.toHaveBeenCalled();

        expect(logActivityMock).toHaveBeenCalledWith(
            expect.objectContaining({
                activityType: "collection_dispute_opened",
            })
        );
    });

    it("ambiguous sender (multiple customers share the email): abstains — no attribution, no case query, no extraction", async () => {
        const { handleCollectionRelevantEmail } = await import(
            "./collectionCaseOrchestrationService"
        );

        supabaseMock.queueResponse("customers", {
            data: null,
            error: { code: "PGRST116", message: "multiple (or no) rows returned" },
        });

        await handleCollectionRelevantEmail({
            id: "email-r5-ambiguous",
            subject: "Payment promise",
            text_body: "We will pay next week.",
            from_email: "shared@example.com",
            classification: "payment_promise",
            classification_confidence: 0.9,
            gmail_message_id: "inbound-r5-ambiguous",
            gmail_thread_id: "thread-r5-ambiguous",
        });

        expect(extractPromiseDetailsMock).not.toHaveBeenCalled();
        expect(extractExceptionDetailsMock).not.toHaveBeenCalled();
        expect(
            supabaseMock.getCalls("emails").some((call) => call.method === "update")
        ).toBe(false);
        expect(supabaseMock.getCalls("collection_cases")).toHaveLength(0);
    });

    it("customer resolved but has no active case: email is still attributed (context recorded), but no extraction or case evaluation runs", async () => {
        const { handleCollectionRelevantEmail } = await import(
            "./collectionCaseOrchestrationService"
        );

        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r5c", company_name: "Gamma Inc", email: "gamma@example.com" },
            error: null,
        });

        // handleCollectionRelevantEmail's own getActiveCaseForCustomer() —
        // no active case.
        supabaseMock.queueResponse("collection_cases", { data: null, error: null });

        await handleCollectionRelevantEmail({
            id: "email-r5-noactivecase",
            subject: "Quick question",
            text_body: "What is the due date on this invoice?",
            from_email: "gamma@example.com",
            classification: "customer_inquiry",
            classification_confidence: 0.7,
            gmail_message_id: "inbound-r5-noactivecase",
            gmail_thread_id: "thread-r5-noactivecase",
        });

        const emailsUpdateCall = supabaseMock
            .getCalls("emails")
            .find((call) => call.method === "update");
        expect(emailsUpdateCall?.args[0]).toMatchObject({
            customer_id: "cust-r5c",
        });

        expect(extractPromiseDetailsMock).not.toHaveBeenCalled();
        expect(extractExceptionDetailsMock).not.toHaveBeenCalled();
        // Never reaches evaluateOrOpenCollectionCase()'s own read.
        expect(
            supabaseMock.getCalls("customer_receivables_assessments")
        ).toHaveLength(0);
    });
});
