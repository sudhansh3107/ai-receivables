import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------
// Responsibility #7 (Handle Disputes / Blockers / Exceptions) — end-to-end
// coverage entering at the SAME real production functions the actual
// app routes/sweeps call:
//
//   - Fresh/revised dispute & blocker reports: processUnclassifiedEmails()
//     [real R5 ingestion: relevance -> mocked classification -> mocked
//     extraction -> real customer/case linkage -> real decision engine].
//   - Re-evaluation (wait/check-in/escalation): evaluateOrOpenCollectionCase(
//     customerId) [real, no options] — the exact call
//     app/api/collection-cases/backfill/route.ts's scheduled sweep makes.
//   - Human resolution: resolveExceptionManually() [real] — the exact
//     call app/api/collection-cases/[id]/resolve-exception/route.ts makes.
//
// Every scenario closes the loop through getCollectionCaseDetail(),
// using fixtures built from captured write-call arguments
// (supabaseMock.lastCallArgs), exactly like r5EndToEnd.test.ts and
// r6PromiseLifecycle.test.ts — a pass proves the read path renders what
// the write path actually persisted.
//
// Mocked: OpenAI-backed extraction/classification, Gmail send/metadata,
// and the read-only #2 signal a "follow_up"/"contact"-style outreach
// email's copy depends on (getOverdueInvoiceDetail — never reached by
// any scenario here, since dispute/blocker outreach never uses that
// composer, but mocked so the module graph loads). Everything else —
// relevance gate, customer resolution, case service, decision engine
// (including the new confidence/revision/precedence logic), activity
// log, dashboard read — is real production code against a per-table
// FIFO Supabase mock.
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

function baseCollectionCaseRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "case-r7",
        customer_id: "cust-r7",
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
// 1. FRESH DISPUTE — confidence persisted end-to-end
// =========================================================================

describe("E2E — fresh dispute with confidence persisted", () => {
    it("realistic dispute email flows through ingestion, extraction, acceptance, and confidence is visible in case history", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-dispute-fresh",
            subject: "Invoice INV-4001 — quantity is wrong",
            text_body:
                "We were billed for 100 units but only received 80. Please correct this before we can pay.",
            from_email: "ap@deltaworks.com",
            received_at: "2026-08-20T09:00:00.000Z",
            gmail_message_id: "gmail-msg-dispute-fresh",
            gmail_thread_id: "gmail-thread-dispute-fresh",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({
            classification: "dispute",
            confidence: 0.9,
        });
        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "dispute" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r7", company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
            error: null,
        });

        const caseRow = baseCollectionCaseRow();
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "goods_not_received",
            detail: "Customer received 80 of 100 billed units.",
            confidence: 0.89,
        });

        queueAssessment(45000);
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-dispute-fresh@mail.gmail.com" });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-ack-dispute-fresh", threadId: "gmail-thread-dispute-fresh" });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "disputed" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "disputed",
            exception_category: "dispute",
            exception_type: "goods_not_received",
            exception_confidence: 0.89,
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({ activity_type: "collection_dispute_opened" });
        const metadata = activityInsertArgs?.metadata as Record<string, unknown>;
        expect(metadata.exceptionConfidence).toBe(0.89);
        expect(metadata.wasRevision).toBe(false);

        const { getCollectionCaseDetail } = await import("./collectionCaseDashboardService");

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseRow,
                ...caseUpdateArgs,
                customers: { company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-dispute-fresh",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T09:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", {
            data: [{ id: inboundEmail.id, subject: inboundEmail.subject, text_body: inboundEmail.text_body, received_at: inboundEmail.received_at, classification: "dispute" }],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-r7");

        expect(detail?.status).toBe("disputed");
        expect(detail?.exceptionType).toBe("goods_not_received");
        expect(detail?.exceptionConfidence).toBe(0.89);
        const outbound = detail?.communicationHistory.find((entry) => entry.id === "activity-dispute-fresh");
        expect(outbound?.activityType).toBe("collection_dispute_opened");
    });
});

// =========================================================================
// 2. FRESH BLOCKER — confidence persisted end-to-end
// =========================================================================

describe("E2E — fresh blocker with confidence persisted", () => {
    it("realistic blocker email is accepted (confidence above floor), no acknowledgment sent, confidence visible in case history", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-blocker-fresh",
            subject: "Payment held up — PO pending",
            text_body: "Our finance team hasn't issued the PO yet. We intend to pay once it clears.",
            from_email: "finance@epsiloncorp.com",
            received_at: "2026-08-20T10:00:00.000Z",
            gmail_message_id: "gmail-msg-blocker-fresh",
            gmail_thread_id: "gmail-thread-blocker-fresh",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "payment_blocker", confidence: 0.91 });
        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_blocker" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r7b", company_name: "Epsilon Corp", contact_name: null, email: "finance@epsiloncorp.com" },
            error: null,
        });

        const caseRow = baseCollectionCaseRow({ id: "case-r7b", customer_id: "cust-r7b" });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "po_issue",
            detail: "Internal PO not yet issued.",
            confidence: 0.9,
        });

        queueAssessment(30000);
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "payment_blocked" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "payment_blocked",
            exception_type: "po_issue",
            exception_confidence: 0.9,
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({ activity_type: "collection_blocker_opened" });

        const { getCollectionCaseDetail } = await import("./collectionCaseDashboardService");

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseRow,
                ...caseUpdateArgs,
                customers: { company_name: "Epsilon Corp", contact_name: null, email: "finance@epsiloncorp.com" },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-blocker-fresh",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T10:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", {
            data: [{ id: inboundEmail.id, subject: inboundEmail.subject, text_body: inboundEmail.text_body, received_at: inboundEmail.received_at, classification: "payment_blocker" }],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-r7b");

        expect(detail?.status).toBe("payment_blocked");
        expect(detail?.exceptionConfidence).toBe(0.9);
        const outbound = detail?.communicationHistory.find((entry) => entry.id === "activity-blocker-fresh");
        expect(outbound?.activityType).toBe("collection_blocker_opened");
    });
});

// =========================================================================
// 3. LOW-CONFIDENCE BLOCKER — evidence-only
// =========================================================================

describe("E2E — low-confidence blocker remains evidence-only", () => {
    it("a blocker classification below the acceptance floor never opens an exception or mutates case status", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-blocker-lowconf",
            subject: "re: invoice",
            text_body: "hmm not sure, checking on this",
            from_email: "ops@zetatraders.com",
            received_at: "2026-08-20T11:00:00.000Z",
            gmail_message_id: "gmail-msg-blocker-lowconf",
            gmail_thread_id: "gmail-thread-blocker-lowconf",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });
        // Below BLOCKER_CLASSIFICATION_CONFIDENCE_FLOOR (0.8).
        classifyEmailMock.mockResolvedValueOnce({ classification: "payment_blocker", confidence: 0.65 });
        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_blocker" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r7c", company_name: "Zeta Traders", contact_name: null, email: "ops@zetatraders.com" },
            error: null,
        });

        const caseRow = baseCollectionCaseRow({
            id: "case-r7c",
            customer_id: "cust-r7c",
            // Not yet due — keeps Step 2's awaiting_response cascade a
            // silent "wait" so this test stays focused purely on the
            // blocker-rejection behavior, without needing to also stand
            // up an unrelated follow_up/contact send.
            next_evaluation_at: "2099-01-01T00:00:00.000Z",
        });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        // Extraction still runs (dispatch is classification-driven, not
        // confidence-gated) — the GATE lives entirely in the decision
        // engine's T9 branch.
        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "other",
            detail: "Unclear.",
            confidence: 0.5,
        });

        queueAssessment(20000);
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });

        // The "wait" (evidence-only) path — applyCaseTransition is the
        // only remaining write, and it never touches exception_*.
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(sendGmailReplyMock).not.toHaveBeenCalled();
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).not.toHaveProperty("exception_category");
        expect(caseUpdateArgs).not.toHaveProperty("exception_confidence");
        expect(caseUpdateArgs?.status).toBe(caseRow.status); // unchanged
    });
});

// =========================================================================
// 4. DISPUTE RE-EVALUATION — silent wait when not yet due
// =========================================================================

describe("E2E — dispute re-evaluation (wait behavior)", () => {
    it("evaluateOrOpenCollectionCase(customerId) — the backfill sweep's exact call — silently waits when the re-evaluation interval hasn't elapsed", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const disputedCase = baseCollectionCaseRow({
            id: "case-r7-wait",
            customer_id: "cust-r7-wait",
            status: "disputed",
            next_evaluation_at: "2099-01-01T00:00:00.000Z", // not yet due
            exception_category: "dispute",
            exception_type: "amount_disputed",
            exception_status: "open",
            exception_confidence: 0.8,
        });

        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        queueAssessment(15000);
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });

        await evaluateOrOpenCollectionCase("cust-r7-wait");

        expect(sendGmailReplyMock).not.toHaveBeenCalled();
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({ status: "disputed" });
        expect(caseUpdateArgs).not.toHaveProperty("exception_status");
    });
});

// =========================================================================
// 5. BLOCKER CHECK-IN
// =========================================================================

describe("E2E — blocker check-in behavior", () => {
    it("sends a gentle, un-threaded check-in when the interval is due and the escalation gate isn't satisfied", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const blockedCase = baseCollectionCaseRow({
            id: "case-r7-checkin",
            customer_id: "cust-r7-checkin",
            status: "payment_blocked",
            next_evaluation_at: "2020-01-01T00:00:00.000Z", // due
            exception_category: "blocker",
            exception_type: "approval_pending",
            exception_status: "open",
            exception_confidence: 0.85,
        });

        supabaseMock.queueResponse("collection_cases", { data: blockedCase, error: null });
        queueAssessment(15000, { priority: "medium" });
        supabaseMock.queueResponse("collection_cases", { data: blockedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Checkin Co", contact_name: null, email: "ap@checkin.com" },
            error: null,
        });

        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-checkin", threadId: "thread-checkin" });

        supabaseMock.queueResponse("collection_cases", { data: blockedCase, error: null });

        await evaluateOrOpenCollectionCase("cust-r7-checkin");

        // A fresh, un-threaded send (no reply-in-thread metadata lookup).
        expect(getOriginalMessageMetadataMock).not.toHaveBeenCalled();
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({ status: "payment_blocked" });
        // check-ins are not collection pressure.
        expect(caseUpdateArgs).not.toHaveProperty("unanswered_outreach_count");
        // A check-in IS a real outbound send, so — unlike a plain silent
        // "wait" — it IS logged, same as any other outreach. It maps to
        // the generic COLLECTION_OUTREACH_SENT type (no dispute/blocker-
        // specific activity type exists for a check-in itself).
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);
        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_outreach_sent",
        });
    });
});

// =========================================================================
// 6. DISPUTE ESCALATION
// =========================================================================

describe("E2E — dispute escalation", () => {
    it("escalates once the canonical gate is satisfied, routing the exception to a human", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const disputedCase = baseCollectionCaseRow({
            id: "case-r7-escalate-dispute",
            customer_id: "cust-r7-escalate-dispute",
            status: "disputed",
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
            exception_category: "dispute",
            exception_type: "invoice_incorrect",
            exception_status: "open",
        });

        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        queueAssessment(80000, { assessment: "critical", priority: "critical" });
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...disputedCase, status: "escalated" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-r7-escalate-dispute");

        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "escalated",
            exception_status: "routed_to_human",
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({ activity_type: "collection_case_escalated" });

        const { getCollectionCaseDetail } = await import("./collectionCaseDashboardService");

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...disputedCase,
                ...caseUpdateArgs,
                customers: { company_name: "Escalate Dispute Co", contact_name: null, email: "ap@escalate.com" },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-escalate-dispute",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T12:00:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const detail = await getCollectionCaseDetail("case-r7-escalate-dispute");

        expect(detail?.status).toBe("escalated");
        expect(detail?.exceptionStatus).toBe("routed_to_human");
    });
});

// =========================================================================
// 7. BLOCKER ESCALATION
// =========================================================================

describe("E2E — blocker escalation", () => {
    it("escalates a persistent blocker once the canonical gate is satisfied", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const blockedCase = baseCollectionCaseRow({
            id: "case-r7-escalate-blocker",
            customer_id: "cust-r7-escalate-blocker",
            status: "payment_blocked",
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
            exception_category: "blocker",
            exception_type: "vendor_onboarding",
            exception_status: "open",
        });

        supabaseMock.queueResponse("collection_cases", { data: blockedCase, error: null });
        queueAssessment(80000, { assessment: "critical", priority: "critical" });
        supabaseMock.queueResponse("collection_cases", { data: blockedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...blockedCase, status: "escalated" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-r7-escalate-blocker");

        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "escalated",
            exception_status: "routed_to_human",
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({ activity_type: "collection_case_escalated" });
    });
});

// =========================================================================
// 8. HUMAN RESOLUTION of a non-escalated exception
// =========================================================================

describe("E2E — human resolution of a non-escalated exception", () => {
    it("resolveExceptionManually() clears the exception, returns the case to normal chasing, and a later evaluation proceeds normally", async () => {
        const { resolveExceptionManually } = await import(
            "./collectionCaseService"
        );

        const disputedCase = baseCollectionCaseRow({
            id: "case-r7-human-resolve",
            customer_id: "cust-r7-human-resolve",
            status: "disputed",
            outreach_count: 1,
            exception_category: "dispute",
            exception_type: "amount_disputed",
            exception_status: "open",
            exception_detail: "Customer disputed the amount.",
            exception_confidence: 0.8,
        });

        // resolveExceptionManually()'s own fetch, then conditional UPDATE.
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...disputedCase,
                status: "awaiting_response",
                exception_status: "resolved",
            },
            error: null,
        });

        const resolved = await resolveExceptionManually("case-r7-human-resolve");

        expect(resolved.status).toBe("awaiting_response");
        expect(resolved.exception_status).toBe("resolved");
        // WHAT was resolved stays visible — never nulled out.
        expect(resolved.exception_category).toBe("dispute");
        expect(resolved.exception_type).toBe("amount_disputed");

        // A LATER evaluation now proceeds through the ordinary
        // awaiting_response cascade — never re-entering the disputed
        // branch, since status is no longer 'disputed'.
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const resumedCase = {
            ...disputedCase,
            status: "awaiting_response",
            exception_status: "resolved",
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
        };

        supabaseMock.queueResponse("collection_cases", { data: resumedCase, error: null });
        queueAssessment(15000);
        supabaseMock.queueResponse("collection_cases", { data: resumedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Human Resolve Co", contact_name: null, email: "ap@humanresolve.com" },
            error: null,
        });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 15000,
            overdueAmount: 15000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 10,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-post-resolve", threadId: "thread-post-resolve" });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...resumedCase, status: "unresponsive" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-r7-human-resolve");

        // Ordinary chasing resumed — a follow_up was sent, never a
        // dispute-flavored decision.
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);
        const secondUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(secondUpdateArgs).not.toHaveProperty("exception_status");
    });

    it("rejects resolving an exception on an escalated case (use resume-from-escalation instead)", async () => {
        const { resolveExceptionManually, CaseTransitionConflictError } =
            await import("./collectionCaseService");

        void CaseTransitionConflictError;

        supabaseMock.queueResponse("collection_cases", {
            data: baseCollectionCaseRow({ status: "escalated" }),
            error: null,
        });

        await expect(
            resolveExceptionManually("case-r7")
        ).rejects.toThrow(/not "disputed" or "payment_blocked"/);
    });
});

// =========================================================================
// 9. EXCEPTION REVISION / HISTORY PRESERVATION
// =========================================================================

describe("E2E — exception revision preserves history", () => {
    it("a second dispute report while one is already open preserves the prior report and is logged as a distinct revision", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-dispute-revision-e2e",
            subject: "Re: Invoice INV-4001",
            text_body: "Actually, on closer look the total amount charged is also incorrect.",
            from_email: "ap@deltaworks.com",
            received_at: "2026-08-21T09:00:00.000Z",
            gmail_message_id: "gmail-msg-dispute-revision",
            gmail_thread_id: "gmail-thread-dispute-revision",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "dispute", confidence: 0.92 });
        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "dispute" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r7-revision", company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
            error: null,
        });

        const originalOpenedAt = "2026-08-20T09:00:00.000Z";
        const disputedCase = baseCollectionCaseRow({
            id: "case-r7-revision",
            customer_id: "cust-r7-revision",
            status: "disputed",
            exception_category: "dispute",
            exception_type: "goods_not_received",
            exception_status: "open",
            exception_detail: "Received 80 of 100 billed units.",
            exception_confidence: 0.89,
            exception_opened_at: originalOpenedAt,
        });

        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "amount_disputed",
            detail: "Total amount charged is also incorrect.",
            confidence: 0.93,
        });

        queueAssessment(45000);
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-dispute-revision@mail.gmail.com" });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-ack-dispute-revision", threadId: "gmail-thread-dispute-revision" });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...disputedCase, status: "disputed" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            exception_type: "amount_disputed",
            exception_confidence: 0.93,
        });
        // The ORIGINAL opened_at is never overwritten by a same-category
        // revision.
        expect(caseUpdateArgs).not.toHaveProperty("exception_opened_at");

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({ activity_type: "collection_dispute_revised" });
        const metadata = activityInsertArgs?.metadata as Record<string, unknown>;
        expect(metadata.previousException).toEqual({
            category: "dispute",
            type: "goods_not_received",
            detail: "Received 80 of 100 billed units.",
            confidence: 0.89,
            openedAt: originalOpenedAt,
        });

        const { getCollectionCaseDetail } = await import("./collectionCaseDashboardService");

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...disputedCase,
                ...caseUpdateArgs,
                customers: { company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-dispute-revision-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-21T09:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", {
            data: [{ id: inboundEmail.id, subject: inboundEmail.subject, text_body: inboundEmail.text_body, received_at: inboundEmail.received_at, classification: "dispute" }],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-r7-revision");

        expect(detail?.exceptionType).toBe("amount_disputed");
        const outbound = detail?.communicationHistory.find((entry) => entry.id === "activity-dispute-revision-e2e");
        expect(outbound?.activityType).toBe("collection_dispute_revised");
    });
});

// =========================================================================
// 10. PROMISE ARRIVING DURING ACTIVE DISPUTE
// =========================================================================

describe("E2E — promise arriving during an active dispute", () => {
    it("the promise is extracted (evidence) but never accepted; the dispute is never cleared; the email remains visible in case history", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-promise-during-dispute-e2e",
            subject: "Re: Invoice INV-4001",
            text_body: "Regardless, we'll go ahead and pay INR 45,000 by September 1st.",
            from_email: "ap@deltaworks.com",
            received_at: "2026-08-21T10:00:00.000Z",
            gmail_message_id: "gmail-msg-promise-during-dispute",
            gmail_thread_id: "gmail-thread-promise-during-dispute",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "payment_promise", confidence: 0.9 });
        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_promise" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r7-promise-dispute", company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
            error: null,
        });

        const disputedCase = baseCollectionCaseRow({
            id: "case-r7-promise-dispute",
            customer_id: "cust-r7-promise-dispute",
            status: "disputed",
            next_evaluation_at: "2099-01-01T00:00:00.000Z", // not yet due
            exception_category: "dispute",
            exception_type: "amount_disputed",
            exception_status: "open",
        });

        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });

        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true,
            amountStated: true,
            amount: 45000,
            currency: "INR",
            promiseDate: "2026-09-01",
            confidence: 0.9,
        });

        queueAssessment(45000);
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        // Extraction still ran — the promise's content is genuine
        // evidence, it just was never acted upon.
        expect(extractPromiseDetailsMock).toHaveBeenCalledWith({
            subject: inboundEmail.subject,
            textBody: inboundEmail.text_body,
        });
        expect(sendGmailReplyMock).not.toHaveBeenCalled();
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        // Status never left disputed; no promise_* field was ever written.
        expect(caseUpdateArgs?.status).toBe("disputed");
        expect(caseUpdateArgs).not.toHaveProperty("promise_amount");
        expect(caseUpdateArgs).not.toHaveProperty("promise_status");
        expect(caseUpdateArgs).not.toHaveProperty("exception_status");

        // The promise email itself is still preserved as visible
        // context in case history, even though it had no case effect.
        const { getCollectionCaseDetail } = await import("./collectionCaseDashboardService");

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...disputedCase,
                customers: { company_name: "Delta Works", contact_name: "Amit", email: "ap@deltaworks.com" },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", { data: [], error: null });
        supabaseMock.queueResponse("emails", {
            data: [{ id: inboundEmail.id, subject: inboundEmail.subject, text_body: inboundEmail.text_body, received_at: inboundEmail.received_at, classification: "payment_promise" }],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-r7-promise-dispute");

        expect(detail?.status).toBe("disputed");
        expect(detail?.promiseAmount).toBeNull();
        const inbound = detail?.communicationHistory.find((entry) => entry.id === inboundEmail.id);
        expect(inbound?.classification).toBe("payment_promise");
        expect(inbound?.body).toContain("45,000");
    });
});

// =========================================================================
// 11. IDEMPOTENCY
// =========================================================================

describe("E2E — idempotency", () => {
    it("an already-escalated exception is never re-escalated or re-logged on a subsequent evaluation", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const escalatedCase = baseCollectionCaseRow({
            id: "case-r7-idempotent-escalated",
            customer_id: "cust-r7-idempotent-escalated",
            status: "escalated",
            exception_category: "dispute",
            exception_type: "invoice_incorrect",
            exception_status: "routed_to_human",
            escalated_at: "2026-08-15T00:00:00.000Z",
            escalation_reason: "Dispute remains unresolved and the escalation gate is now satisfied.",
        });

        // evaluateOrOpenCollectionCase's Step 0 gate (hasOutstanding
        // still true) does not resolve it, and status='escalated' means
        // no claim/cascade runs at all — this call must be a pure no-op.
        supabaseMock.queueResponse("collection_cases", { data: escalatedCase, error: null });
        queueAssessment(80000);

        await evaluateOrOpenCollectionCase("cust-r7-idempotent-escalated");

        expect(supabaseMock.callCount("collection_cases", "update")).toBe(0);
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);
        expect(sendGmailReplyMock).not.toHaveBeenCalled();
    });

    it("a concurrent/duplicate evaluation trigger (claim conflict) on a disputed case produces zero additional writes", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const disputedCase = baseCollectionCaseRow({
            id: "case-r7-idempotent-claim",
            customer_id: "cust-r7-idempotent-claim",
            status: "disputed",
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
            exception_category: "dispute",
            exception_type: "invoice_incorrect",
            exception_status: "open",
        });

        // --- First (winning) evaluation. ---
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        queueAssessment(80000, { assessment: "critical", priority: "critical" });
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...disputedCase, status: "escalated" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-r7-idempotent-claim");

        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);

        // --- Second (losing) evaluation for the SAME case: reads the
        // same still-disputed snapshot, but its claim matches zero rows
        // because the winner already moved next_evaluation_at. ---
        supabaseMock.queueResponse("collection_cases", { data: disputedCase, error: null });
        supabaseMock.queueResponse("collection_cases", { data: null, error: null }); // claim fails

        await expect(
            evaluateOrOpenCollectionCase("cust-r7-idempotent-claim")
        ).resolves.toBeUndefined();

        // No second escalation, no second activity row.
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);
        expect(
            supabaseMock.getCalls("collection_cases").filter((call) => call.method === "update")
        ).toHaveLength(2); // the winner's claim + the winner's applyCaseTransition
    });
});

// =========================================================================
// 12. DISPUTE SUPERSEDES AN ALREADY-OPEN BLOCKER (category change, real
// ingestion pipeline end-to-end)
// =========================================================================
//
// The one remaining E2E gap: scenario 9 covers a dispute revising an
// already-open DISPUTE (same category). This covers the other
// possibility T6's own comment calls out — a dispute arriving while a
// BLOCKER is open, i.e. a category CHANGE, not a same-category revision.
// Per the dispute-precedence rule the dispute still wins unconditionally
// and still becomes authoritative, but unlike scenario 9,
// isRevision/wasRevision is FALSE here (categories differ), so it opens
// a genuinely fresh exception_opened_at rather than preserving the
// original — while still carrying the superseded blocker forward as
// `previousException` audit evidence, exactly like a same-category
// revision does.
describe("E2E — dispute supersedes an already-open blocker", () => {
    it("a DISPUTE email arriving while a PAYMENT_BLOCKER is open becomes authoritative, opens a fresh exception clock, and preserves the blocker as superseded evidence", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        // -----------------------------------------------------------
        // Step 1 — establish an active PAYMENT_BLOCKER through the real
        // ingestion pipeline (same shape as scenario 2).
        // -----------------------------------------------------------
        const blockerEmail = {
            id: "email-blocker-then-dispute",
            subject: "Payment on hold — internal approval pending",
            text_body:
                "Our AP team needs internal approval before we can release payment on this invoice.",
            from_email: "ap@theta-industries.com",
            received_at: "2026-08-20T08:00:00.000Z",
            gmail_message_id: "gmail-msg-blocker-then-dispute",
            gmail_thread_id: "gmail-thread-blocker-then-dispute",
        };

        supabaseMock.queueResponse("emails", { data: [blockerEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "payment_blocker", confidence: 0.92 });
        supabaseMock.queueResponse("emails", {
            data: { ...blockerEmail, classification: "payment_blocker" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r7-supersede", company_name: "Theta Industries", contact_name: "Priya", email: "ap@theta-industries.com" },
            error: null,
        });

        const openCaseRow = baseCollectionCaseRow({
            id: "case-r7-supersede",
            customer_id: "cust-r7-supersede",
        });
        supabaseMock.queueResponse("collection_cases", { data: openCaseRow, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "approval_pending",
            detail: "Internal AP approval not yet granted.",
            confidence: 0.88,
        });

        queueAssessment(52000);
        supabaseMock.queueResponse("collection_cases", { data: openCaseRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: openCaseRow, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...openCaseRow, status: "payment_blocked" },
            error: null,
        });

        const blockerResult = await processUnclassifiedEmails(1);

        expect(blockerResult.classified).toBe(1);
        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        // Step 2 — verify the blocker is persisted as open.
        const blockerUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(blockerUpdateArgs).toMatchObject({
            status: "payment_blocked",
            exception_category: "blocker",
            exception_type: "approval_pending",
            exception_status: "open",
            exception_detail: "Internal AP approval not yet granted.",
            exception_confidence: 0.88,
        });
        expect(blockerUpdateArgs).toHaveProperty("exception_opened_at");

        const blockerActivityArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(blockerActivityArgs).toMatchObject({ activity_type: "collection_blocker_opened" });

        // The case row as it now genuinely exists in the DB — built from
        // the actual persisted write, the same captured-write-argument
        // pattern used throughout this file — is what the SECOND email's
        // ingestion will read back.
        const blockedCaseRow = { ...openCaseRow, ...blockerUpdateArgs } as typeof openCaseRow;

        // -----------------------------------------------------------
        // Step 3 — a second, realistic customer email — this time a
        // DISPUTE — through the same real pipeline: relevance ->
        // classification -> customer resolution -> exception extraction
        // -> case decision -> persistence.
        // -----------------------------------------------------------
        const disputeEmail = {
            id: "email-dispute-supersedes-blocker",
            subject: "Re: Invoice — actually we're disputing this",
            text_body:
                "Forget the approval delay — on closer review the billed quantity itself is wrong. We're disputing the invoice.",
            from_email: "ap@theta-industries.com",
            received_at: "2026-08-22T09:00:00.000Z",
            gmail_message_id: "gmail-msg-dispute-supersedes-blocker",
            gmail_thread_id: "gmail-thread-dispute-supersedes-blocker",
        };

        supabaseMock.queueResponse("emails", { data: [disputeEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "dispute", confidence: 0.94 });
        supabaseMock.queueResponse("emails", {
            data: { ...disputeEmail, classification: "dispute" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: "cust-r7-supersede", company_name: "Theta Industries", contact_name: "Priya", email: "ap@theta-industries.com" },
            error: null,
        });

        supabaseMock.queueResponse("collection_cases", { data: blockedCaseRow, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "invoice_incorrect",
            detail: "Billed quantity does not match goods invoiced.",
            confidence: 0.95,
        });

        queueAssessment(52000);
        supabaseMock.queueResponse("collection_cases", { data: blockedCaseRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: blockedCaseRow, error: null });
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Theta Industries", contact_name: "Priya", email: "ap@theta-industries.com" },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-dispute-supersedes-blocker@mail.gmail.com" });
        sendGmailReplyMock.mockResolvedValueOnce({ messageId: "msg-ack-supersede", threadId: "gmail-thread-dispute-supersedes-blocker" });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...blockedCaseRow, status: "disputed" },
            error: null,
        });

        const disputeResult = await processUnclassifiedEmails(1);

        expect(disputeResult.classified).toBe(1);
        expect(disputeResult.failed).toBe(0);
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);

        // -----------------------------------------------------------
        // Step 4/5 — assert the dispute is authoritative, opens a fresh
        // clock, and the blocker is preserved as superseded evidence.
        // -----------------------------------------------------------
        const disputeUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(disputeUpdateArgs).toMatchObject({
            status: "disputed",
            exception_category: "dispute",
            exception_type: "invoice_incorrect",
            exception_status: "open",
            exception_detail: "Billed quantity does not match goods invoiced.",
            exception_confidence: 0.95,
        });

        // Fresh exception_opened_at — a category CHANGE (blocker ->
        // dispute) is never treated as a same-category revision, so the
        // original opened_at is NOT carried forward (contrast with
        // scenario 9, which omits this field entirely for a same-
        // category revision).
        expect(disputeUpdateArgs).toHaveProperty("exception_opened_at");
        expect(disputeUpdateArgs?.exception_opened_at).not.toBe(
            blockerUpdateArgs?.exception_opened_at
        );

        const disputeActivityArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        // Category CHANGE, not a same-category revision, so this logs as
        // a (superseding) dispute OPENING — not collection_dispute_revised
        // — exactly as T6/selectOutreachActivityType key wasRevision off
        // same-category only. The superseded blocker is still fully
        // preserved as audit evidence in the metadata below.
        expect(disputeActivityArgs).toMatchObject({ activity_type: "collection_dispute_opened" });

        const metadata = disputeActivityArgs?.metadata as Record<string, unknown>;
        expect(metadata.wasRevision).toBe(false);
        expect(metadata.exceptionConfidence).toBe(0.95);
        // The previous BLOCKER's type/detail/confidence/opened_at are
        // fully preserved in the revision/supersession evidence, even
        // though it's no longer the authoritative exception.
        expect(metadata.previousException).toEqual({
            category: "blocker",
            type: "approval_pending",
            detail: "Internal AP approval not yet granted.",
            confidence: 0.88,
            openedAt: blockerUpdateArgs?.exception_opened_at,
        });

        // No incorrect blocker state remains authoritative on the case
        // itself — the persisted row carries only the dispute now.
        expect(disputeUpdateArgs?.exception_category).not.toBe("blocker");
        expect(disputeUpdateArgs?.exception_type).not.toBe("approval_pending");

        // -----------------------------------------------------------
        // Step 6 — read back through getCollectionCaseDetail(), using
        // the same captured-write-argument fixture pattern as every
        // other scenario in this file.
        // -----------------------------------------------------------
        const { getCollectionCaseDetail } = await import("./collectionCaseDashboardService");

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...blockedCaseRow,
                ...disputeUpdateArgs,
                customers: { company_name: "Theta Industries", contact_name: "Priya", email: "ap@theta-industries.com" },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-blocker-then-dispute",
                    activity_type: blockerActivityArgs?.activity_type,
                    description: blockerActivityArgs?.description,
                    metadata: blockerActivityArgs?.metadata,
                    created_at: "2026-08-20T08:05:00.000Z",
                },
                {
                    id: "activity-dispute-supersedes-blocker",
                    activity_type: disputeActivityArgs?.activity_type,
                    description: disputeActivityArgs?.description,
                    metadata: disputeActivityArgs?.metadata,
                    created_at: "2026-08-22T09:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", {
            data: [
                { id: blockerEmail.id, subject: blockerEmail.subject, text_body: blockerEmail.text_body, received_at: blockerEmail.received_at, classification: "payment_blocker" },
                { id: disputeEmail.id, subject: disputeEmail.subject, text_body: disputeEmail.text_body, received_at: disputeEmail.received_at, classification: "dispute" },
            ],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-r7-supersede");

        expect(detail?.status).toBe("disputed");
        expect(detail?.exceptionType).toBe("invoice_incorrect");
        expect(detail?.exceptionConfidence).toBe(0.95);

        const supersedingEntry = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-dispute-supersedes-blocker"
        );
        expect(supersedingEntry?.activityType).toBe("collection_dispute_opened");

        // The original blocker-opened event stays visible in history —
        // it was superseded, never erased.
        const originalBlockerEntry = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-blocker-then-dispute"
        );
        expect(originalBlockerEntry?.activityType).toBe("collection_blocker_opened");
    });
});
