import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------
// Responsibility #6 (Manage Promises to Pay) — end-to-end coverage of
// the promise-fulfilment lifecycle, entering at the SAME real
// production functions the actual app routes call:
//
//   - A revised promise: processUnclassifiedEmails() [real, same R5
//     entry point] for two sequential payment_promise emails against
//     the same active case.
//   - Fulfilled EARLY (before the promised date): evaluateOrOpenCollectionCase(
//     customerId, { triggeredByPayment: true }) [real] — the EXACT call
//     app/api/payments/route.ts and paymentDecisionExecutionService.ts
//     make immediately after recordPayment() succeeds.
//   - Partial / broken at grace expiry: evaluateOrOpenCollectionCase(
//     customerId) [real, no options] — the EXACT call
//     app/api/collection-cases/backfill/route.ts's scheduled sweep
//     makes for each case returned by getCasesDueForEvaluation().
//
// Every scenario closes the loop through the real read path
// (getCollectionCaseDetail()), using fixtures built from the CAPTURED
// write-call arguments (supabaseMock.lastCallArgs), exactly like
// r5EndToEnd.test.ts — so a pass proves the read path renders what the
// write path actually persisted, not two independently hand-maintained
// guesses that happen to agree.
//
// Mocked: OpenAI-backed extraction/classification, Gmail send/metadata,
// and the two read-only #1/#2 signals this file never recomputes
// (customer_insights.risk_level, getOverdueInvoiceDetail's exposure
// summary for a follow_up's email copy). Everything else — relevance
// gate, customer resolution, case service, decision engine (including
// the new promise-fulfilment logic), activity log, dashboard read — is
// real production code against a per-table FIFO Supabase mock.
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
        // Counts actual QUERY/WRITE invocations (one per .insert()/
        // .update() call), not every chained method call recorded
        // against the table — getCalls() includes .select()/.eq()/
        // .maybeSingle() etc. from the SAME query, so raw .length is
        // never the right way to count "how many inserts happened".
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

// Reached this time (unlike R5's tests) — a "follow_up" outreach kind
// (fulfilled-with-remaining-exposure / partial / broken) composes its
// email via buildExposureSummary(), which reads #2's overdue-invoice
// detail live. Mocked here purely as the read-only #2 boundary; never
// asserted on, since exposure copy is not what this suite is verifying.
const getOverdueInvoiceDetailMock = vi.fn();
vi.mock("./receivablesMonitoringService", () => ({
    getOverdueInvoiceDetail: (...args: unknown[]) =>
        getOverdueInvoiceDetailMock(...args),
}));

function baseCollectionCaseRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "case-r6",
        customer_id: "cust-r6",
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

function queueAssessment(outstandingAmount: number) {
    supabaseMock.queueResponse("customer_receivables_assessments", {
        data: {
            assessment: "needs_attention",
            priority: "medium",
            severity: "elevated",
            deviation: "unknown",
            reason: "Test overdue balance.",
            evidence: { outstandingAmount },
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
// 1. Multiple promises over a case — a revision preserves prior history
// =========================================================================

describe("E2E — revised promise (multiple promises over a case)", () => {
    it("a second payment_promise while the first is still active is recorded as a revision, not a silent overwrite", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-revision-e2e",
            subject: "Re: Outstanding balance on your account",
            text_body:
                "Apologies, we actually need a bit longer — we'll pay INR 80,000 by September 10th instead.",
            from_email: "ap@acme-industries.com",
            received_at: "2026-08-20T09:00:00.000Z",
            gmail_message_id: "gmail-msg-revision",
            gmail_thread_id: "gmail-thread-revision",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_promise",
            confidence: 0.93,
        });

        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_promise" },
            error: null,
        });

        supabaseMock.queueResponse("customers", {
            data: {
                id: "cust-r6",
                company_name: "Acme Industries",
                contact_name: "Priya",
                email: "ap@acme-industries.com",
            },
            error: null,
        });

        // The customer already has an ACTIVE, unexpired promise in
        // flight from an earlier email (₹50,000 by 2026-08-25).
        const caseWithActivePromise = baseCollectionCaseRow({
            status: "promise_to_pay",
            promise_amount: 50000,
            promise_currency: "INR",
            promise_date: "2026-08-25",
            promise_confidence: 0.88,
            promise_status: "active",
            promise_baseline_outstanding_amount: 90000,
        });

        // handleCollectionRelevantEmail's own getActiveCaseForCustomer()
        supabaseMock.queueResponse("collection_cases", {
            data: caseWithActivePromise,
            error: null,
        });

        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true,
            amountStated: true,
            amount: 80000,
            currency: "INR",
            promiseDate: "2026-09-10",
            confidence: 0.93,
        });

        // The live outstanding figure has moved on since the FIRST
        // promise was made — the revision's baseline must be re-snapshot
        // to THIS value, not the stale 90000.
        queueAssessment(85000);
        supabaseMock.queueResponse("collection_cases", {
            data: caseWithActivePromise,
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: caseWithActivePromise,
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
                company_name: "Acme Industries",
                contact_name: "Priya",
                email: "ap@acme-industries.com",
            },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "rfc-revision@mail.gmail.com",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-ack-revision",
            threadId: "gmail-thread-revision",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseWithActivePromise, status: "promise_to_pay" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            promise_amount: 80000,
            promise_date: "2026-09-10",
            promise_status: "active",
            // Re-snapshot to the CURRENT live figure, not the stale
            // baseline from the superseded promise.
            promise_baseline_outstanding_amount: 85000,
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_promise_revised",
            customer_id: "cust-r6",
        });
        // The prior commitment's exact figures survive in the audit
        // trail rather than being silently lost.
        const metadata = activityInsertArgs?.metadata as Record<string, unknown>;
        expect(metadata.previousPromise).toEqual({
            amount: 50000,
            currency: "INR",
            date: "2026-08-25",
            confidence: 0.88,
        });
        expect(metadata.wasRevision).toBe(true);

        // Case-visible communication history surfaces the revision as
        // its own distinct, labeled event.
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseWithActivePromise,
                ...caseUpdateArgs,
                customers: {
                    company_name: "Acme Industries",
                    contact_name: "Priya",
                    email: "ap@acme-industries.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-revision-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T09:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", {
            data: [
                {
                    id: inboundEmail.id,
                    subject: inboundEmail.subject,
                    text_body: inboundEmail.text_body,
                    received_at: inboundEmail.received_at,
                    classification: "payment_promise",
                },
            ],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-r6");

        expect(detail?.promiseAmount).toBe(80000);
        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-revision-e2e"
        );
        expect(outbound?.activityType).toBe("collection_promise_revised");
    });
});

// =========================================================================
// 2. Fulfilled EARLY — a real payment arrives before the promised date
// =========================================================================

describe("E2E — promise fulfilled early via a real payment event", () => {
    it("evaluateOrOpenCollectionCase(triggeredByPayment: true) — the exact call the payment route makes — recognizes fulfilment before the promise date", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const caseRow = baseCollectionCaseRow({
            status: "promise_to_pay",
            promise_amount: 20000,
            promise_currency: "INR",
            promise_date: "2026-09-15", // far in the future — well before grace
            promise_status: "active",
            promise_baseline_outstanding_amount: 90000,
        });

        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        // #2's live outstanding balance dropped by 25,000 since the
        // promise was made — more than the 20,000 promised — as a
        // direct result of the payment that just triggered this call.
        queueAssessment(65000);
        // Only ONE further read here (claimCaseForEvaluation's own
        // update+select) — unlike the R5 email-driven tests, this call
        // enters directly via evaluateOrOpenCollectionCase(), so there
        // is no handleCollectionRelevantEmail wrapper making its own
        // extra getActiveCaseForCustomer() read first.
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
            data: {
                company_name: "Acme Industries",
                contact_name: "Priya",
                email: "ap@acme-industries.com",
            },
            error: null,
        });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 65000,
            overdueAmount: 65000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 3,
            currency: "INR",
        });

        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-followup-remaining",
            threadId: "new-thread-remaining",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "awaiting_response" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-r6", { triggeredByPayment: true });

        // A fresh, un-threaded proactive send — no reply-in-thread call,
        // since fulfilment was recognized on a scheduled/triggered
        // re-evaluation, not a reply to a specific inbound email.
        expect(getOriginalMessageMetadataMock).not.toHaveBeenCalled();
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "awaiting_response",
            promise_status: "kept",
        });
        // A fulfilled promise must never be counted as broken.
        expect(caseUpdateArgs).not.toHaveProperty("broken_promise_count");

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_promise_fulfilled",
        });

        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseRow,
                ...caseUpdateArgs,
                customers: {
                    company_name: "Acme Industries",
                    contact_name: "Priya",
                    email: "ap@acme-industries.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-fulfilled-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T10:00:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const detail = await getCollectionCaseDetail("case-r6");

        expect(detail?.status).toBe("awaiting_response");
        expect(detail?.promiseStatus).toBe("kept");
        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-fulfilled-e2e"
        );
        expect(outbound?.activityType).toBe("collection_promise_fulfilled");
    });
});

// =========================================================================
// 3. Partial payment, promise date passed — the scheduled backfill sweep
// =========================================================================

describe("E2E — partial payment at grace expiry (scheduled re-evaluation)", () => {
    it("evaluateOrOpenCollectionCase(customerId) — the exact call the backfill sweep makes — classifies a shortfall as PARTIAL, not broken", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const caseRow = baseCollectionCaseRow({
            status: "promise_to_pay",
            promise_amount: 10000,
            promise_currency: "INR",
            promise_date: "2026-08-10", // grace already expired
            promise_status: "active",
            promise_baseline_outstanding_amount: 90000,
            broken_promise_count: 0,
        });

        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        queueAssessment(85000); // only 5,000 of the 10,000 promised was paid
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
        supabaseMock.queueResponse("customers", {
            data: {
                company_name: "Acme Industries",
                contact_name: "Priya",
                email: "ap@acme-industries.com",
            },
            error: null,
        });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 85000,
            overdueAmount: 85000,
            overdueInvoiceCount: 2,
            maxDaysOverdue: 12,
            currency: "INR",
        });

        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-followup-partial",
            threadId: "new-thread-partial",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "awaiting_response" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-r6");

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "awaiting_response",
            promise_status: "partial",
        });
        expect(caseUpdateArgs).not.toHaveProperty("broken_promise_count");

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_promise_partially_fulfilled",
        });

        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseRow,
                ...caseUpdateArgs,
                customers: {
                    company_name: "Acme Industries",
                    contact_name: "Priya",
                    email: "ap@acme-industries.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-partial-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T11:00:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const detail = await getCollectionCaseDetail("case-r6");

        expect(detail?.promiseStatus).toBe("partial");
        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-partial-e2e"
        );
        expect(outbound?.activityType).toBe("collection_promise_partially_fulfilled");
    });
});

// =========================================================================
// 4. Zero progress, promise date passed — genuinely broken, end to end
// =========================================================================

describe("E2E — broken promise at grace expiry (scheduled re-evaluation)", () => {
    it("zero payment progress since the baseline is classified as BROKEN and increments broken_promise_count", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const caseRow = baseCollectionCaseRow({
            status: "promise_to_pay",
            promise_amount: 10000,
            promise_currency: "INR",
            promise_date: "2026-08-10",
            promise_status: "active",
            promise_baseline_outstanding_amount: 90000,
            broken_promise_count: 0,
        });

        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        queueAssessment(90000); // no change at all since the promise was made
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "high" },
            error: null,
        });
        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });
        supabaseMock.queueResponse("customers", {
            data: {
                company_name: "Acme Industries",
                contact_name: "Priya",
                email: "ap@acme-industries.com",
            },
            error: null,
        });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 90000,
            overdueAmount: 90000,
            overdueInvoiceCount: 2,
            maxDaysOverdue: 15,
            currency: "INR",
        });

        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-followup-broken",
            threadId: "new-thread-broken",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "awaiting_response" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-r6");

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "awaiting_response",
            promise_status: "broken",
            broken_promise_count: 1,
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_promise_broken",
        });

        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseRow,
                ...caseUpdateArgs,
                customers: {
                    company_name: "Acme Industries",
                    contact_name: "Priya",
                    email: "ap@acme-industries.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-broken-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T12:00:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const detail = await getCollectionCaseDetail("case-r6");

        expect(detail?.promiseStatus).toBe("broken");
        expect(detail?.brokenPromiseCount).toBe(1);
        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-broken-e2e"
        );
        expect(outbound?.activityType).toBe("collection_promise_broken");
    });
});

// =========================================================================
// 5. NEW PROMISE — fresh acceptance, full R5 ingestion to persisted state
// =========================================================================

describe("E2E — new promise (fresh acceptance via full R5 ingestion)", () => {
    it("a first-ever payment_promise is classified, extracted, accepted, and persisted with its baseline snapshot", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-new-promise-e2e",
            subject: "Re: Outstanding balance on your account",
            text_body:
                "Thanks for the reminder — we will pay INR 42,000 by September 3rd.",
            from_email: "ap@newco-industries.com",
            received_at: "2026-08-20T09:00:00.000Z",
            gmail_message_id: "gmail-msg-new-promise",
            gmail_thread_id: "gmail-thread-new-promise",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_promise",
            confidence: 0.91,
        });

        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_promise" },
            error: null,
        });

        supabaseMock.queueResponse("customers", {
            data: {
                id: "cust-new-promise",
                company_name: "NewCo Industries",
                contact_name: "Rahul",
                email: "ap@newco-industries.com",
            },
            error: null,
        });

        // No prior promise on this case at all — status is an ordinary
        // awaiting_response case, promise_* is entirely null.
        const freshCaseRow = baseCollectionCaseRow({
            id: "case-new-promise",
            customer_id: "cust-new-promise",
            status: "awaiting_response",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: freshCaseRow,
            error: null,
        });

        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true,
            amountStated: true,
            amount: 42000,
            currency: "INR",
            promiseDate: "2026-09-03",
            confidence: 0.91,
        });

        queueAssessment(60000);
        supabaseMock.queueResponse("collection_cases", {
            data: freshCaseRow,
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", {
            data: freshCaseRow,
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
                company_name: "NewCo Industries",
                contact_name: "Rahul",
                email: "ap@newco-industries.com",
            },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "rfc-new-promise@mail.gmail.com",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-ack-new-promise",
            threadId: "gmail-thread-new-promise",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...freshCaseRow, status: "promise_to_pay" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        expect(extractPromiseDetailsMock).toHaveBeenCalledWith({
            subject: inboundEmail.subject,
            textBody: inboundEmail.text_body,
        });

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "promise_to_pay",
            promise_amount: 42000,
            promise_currency: "INR",
            promise_date: "2026-09-03",
            promise_confidence: 0.91,
            promise_status: "active",
            // The R6-specific field: a fresh promise snapshots #2's live
            // outstanding figure at acceptance time.
            promise_baseline_outstanding_amount: 60000,
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_promise_acknowledged",
        });
        const metadata = activityInsertArgs?.metadata as Record<string, unknown>;
        expect(metadata.wasRevision).toBe(false);
        expect(metadata).not.toHaveProperty("previousPromise");

        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...freshCaseRow,
                ...caseUpdateArgs,
                customers: {
                    company_name: "NewCo Industries",
                    contact_name: "Rahul",
                    email: "ap@newco-industries.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-new-promise-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T09:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", {
            data: [
                {
                    id: inboundEmail.id,
                    subject: inboundEmail.subject,
                    text_body: inboundEmail.text_body,
                    received_at: inboundEmail.received_at,
                    classification: "payment_promise",
                },
            ],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-new-promise");

        expect(detail?.status).toBe("promise_to_pay");
        expect(detail?.promiseAmount).toBe(42000);
        expect(detail?.promiseCurrency).toBe("INR");
        expect(detail?.promiseDate).toBe("2026-09-03");
        const inbound = detail?.communicationHistory.find(
            (entry) => entry.id === inboundEmail.id
        );
        expect(inbound?.classification).toBe("payment_promise");
        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-new-promise-e2e"
        );
        expect(outbound?.activityType).toBe("collection_promise_acknowledged");
    });
});

// =========================================================================
// 6. DATE-ONLY PROMISE — a date but no stated amount
// =========================================================================

describe("E2E — date-only promise (no amount stated)", () => {
    it("before grace expiry, payment progress does NOT trigger a false early 'fulfilled' verdict (no target amount to satisfy)", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const dateOnlyCase = baseCollectionCaseRow({
            id: "case-date-only",
            customer_id: "cust-date-only",
            status: "promise_to_pay",
            promise_amount: null,
            promise_currency: null,
            promise_date: "2026-09-10", // well in the future — grace has not started
            promise_status: "active",
            promise_baseline_outstanding_amount: 70000,
        });

        supabaseMock.queueResponse("collection_cases", { data: dateOnlyCase, error: null });

        // Real progress since the promise was made (15,000 paid down) —
        // but with no promised figure to compare against, this must
        // never be read as "fulfilled".
        queueAssessment(55000);
        supabaseMock.queueResponse("collection_cases", { data: dateOnlyCase, error: null });
        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "moderate" },
            error: null,
        });
        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });

        // The "wait" path — no outreach, so applyCaseTransition is the
        // only remaining collection_cases write.
        supabaseMock.queueResponse("collection_cases", {
            data: dateOnlyCase,
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-date-only");

        // No email sent, no activity logged — this was a silent wait,
        // not a verdict.
        expect(sendGmailReplyMock).not.toHaveBeenCalled();
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({ status: "promise_to_pay" });
        // A plain wait never touches promise_status.
        expect(caseUpdateArgs).not.toHaveProperty("promise_status");
    });

    it("at grace expiry, some (but unquantifiable-target) progress is classified PARTIAL, visible in case history", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const dateOnlyCase = baseCollectionCaseRow({
            id: "case-date-only-2",
            customer_id: "cust-date-only-2",
            status: "promise_to_pay",
            promise_amount: null,
            promise_currency: null,
            promise_date: "2026-08-05", // grace already expired
            promise_status: "active",
            promise_baseline_outstanding_amount: 70000,
        });

        supabaseMock.queueResponse("collection_cases", { data: dateOnlyCase, error: null });

        queueAssessment(55000); // some progress, no target to fully satisfy
        supabaseMock.queueResponse("collection_cases", { data: dateOnlyCase, error: null });
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
                company_name: "Date Only Co",
                contact_name: null,
                email: "ops@dateonly.com",
            },
            error: null,
        });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 55000,
            overdueAmount: 55000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 8,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-followup-dateonly",
            threadId: "new-thread-dateonly",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...dateOnlyCase, status: "awaiting_response" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-date-only-2");

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "awaiting_response",
            promise_status: "partial",
        });
        expect(caseUpdateArgs).not.toHaveProperty("broken_promise_count");

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_promise_partially_fulfilled",
        });

        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...dateOnlyCase,
                ...caseUpdateArgs,
                customers: {
                    company_name: "Date Only Co",
                    contact_name: null,
                    email: "ops@dateonly.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-dateonly-partial-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-20T13:00:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const detail = await getCollectionCaseDetail("case-date-only-2");

        expect(detail?.promiseStatus).toBe("partial");
        expect(detail?.promiseAmount).toBeNull();
    });
});

// =========================================================================
// 7. IDEMPOTENCY
// =========================================================================

describe("E2E — idempotency", () => {
    it("a promise already resolved (broken) is never re-classified or re-counted on a later, legitimate re-evaluation", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const promiseCase = baseCollectionCaseRow({
            id: "case-idempotent-1",
            customer_id: "cust-idempotent-1",
            status: "promise_to_pay",
            promise_amount: 10000,
            promise_currency: "INR",
            promise_date: "2026-08-05",
            promise_status: "active",
            promise_baseline_outstanding_amount: 90000,
            broken_promise_count: 0,
        });

        // --- First evaluation: the promise genuinely breaks. ---
        supabaseMock.queueResponse("collection_cases", { data: promiseCase, error: null });
        queueAssessment(90000); // zero progress
        supabaseMock.queueResponse("collection_cases", { data: promiseCase, error: null });
        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "high" },
            error: null,
        });
        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Idempotent Co", contact_name: null, email: "ap@idempotent.com" },
            error: null,
        });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 90000,
            overdueAmount: 90000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 20,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-first-broken",
            threadId: "thread-first-broken",
        });

        const brokenCaseRow = {
            ...promiseCase,
            status: "awaiting_response",
            promise_status: "broken",
            broken_promise_count: 1,
            unanswered_outreach_count: promiseCase.unanswered_outreach_count + 1,
            // Due again immediately, for a later legitimate re-evaluation
            // (a real sweep would only pick this up once next_evaluation_at
            // elapses — the mock doesn't enforce timing, so this second
            // call stands in for "the next due sweep pass").
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
        };
        supabaseMock.queueResponse("collection_cases", { data: brokenCaseRow, error: null });

        await evaluateOrOpenCollectionCase("cust-idempotent-1");

        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);
        const firstActivity = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(firstActivity).toMatchObject({
            activity_type: "collection_promise_broken",
        });

        // --- Second evaluation: the SAME (now already-broken) promise
        // must never be re-classified as broken again, and
        // broken_promise_count must never double-increment. The case is
        // no longer status='promise_to_pay', so this now runs the
        // ordinary awaiting_response/unresponsive cascade instead. ---
        supabaseMock.queueResponse("collection_cases", { data: brokenCaseRow, error: null });
        supabaseMock.queueResponse("customer_receivables_assessments", {
            data: {
                assessment: "needs_attention",
                priority: "medium",
                severity: "elevated",
                deviation: "unknown",
                reason: "Still overdue.",
                evidence: { outstandingAmount: 90000 },
            },
            error: null,
        });
        supabaseMock.queueResponse("collection_cases", { data: brokenCaseRow, error: null });
        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "high" },
            error: null,
        });
        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });
        // getCustomerContact() — the awaiting_response/unresponsive
        // cascade also produces a follow_up outreachContext, which
        // needs the customer's contact details exactly like the first
        // evaluation did.
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Idempotent Co", contact_name: null, email: "ap@idempotent.com" },
            error: null,
        });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 90000,
            overdueAmount: 90000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 24,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-second-unresponsive",
            threadId: "thread-second-unresponsive",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...brokenCaseRow, status: "unresponsive" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-idempotent-1");

        // Exactly one MORE activity row — never a second
        // collection_promise_broken for the same original promise.
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(2);
        const secondActivity = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(secondActivity).toMatchObject({
            activity_type: "collection_outreach_sent",
        });

        const secondCaseUpdateArgs = supabaseMock.lastCallArgs(
            "collection_cases",
            "update"
        );
        // broken_promise_count is untouched by this second evaluation —
        // stays at whatever the first evaluation set it to (never
        // re-incremented for the same promise).
        expect(secondCaseUpdateArgs).not.toHaveProperty("broken_promise_count");
        expect(secondCaseUpdateArgs).not.toHaveProperty("promise_status");

        // sendGmailReply fired exactly twice total across both calls
        // (once per evaluation) — never twice for the same evaluation.
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(2);
    });

    it("a concurrent/duplicate evaluation trigger (claim conflict) produces zero additional writes — no duplicate promise outcome or activity", async () => {
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const promiseCase = baseCollectionCaseRow({
            id: "case-idempotent-2",
            customer_id: "cust-idempotent-2",
            status: "promise_to_pay",
            promise_amount: 10000,
            promise_currency: "INR",
            promise_date: "2026-08-05",
            promise_status: "active",
            promise_baseline_outstanding_amount: 90000,
            broken_promise_count: 0,
        });

        // --- First (winning) evaluation: proceeds normally. ---
        supabaseMock.queueResponse("collection_cases", { data: promiseCase, error: null });
        queueAssessment(90000);
        supabaseMock.queueResponse("collection_cases", { data: promiseCase, error: null });
        supabaseMock.queueResponse("customer_insights", {
            data: { risk_level: "high" },
            error: null,
        });
        supabaseMock.queueResponse("payment_decisions", {
            data: null,
            error: null,
            count: 0,
        });
        supabaseMock.queueResponse("customers", {
            data: { company_name: "Race Co", contact_name: null, email: "ap@race.com" },
            error: null,
        });
        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 90000,
            overdueAmount: 90000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 20,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-race-winner",
            threadId: "thread-race-winner",
        });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...promiseCase, status: "awaiting_response", promise_status: "broken" },
            error: null,
        });

        await evaluateOrOpenCollectionCase("cust-idempotent-2");

        // --- Second (losing) evaluation for the SAME case, standing in
        // for a duplicate/concurrent trigger that read its snapshot
        // (the same still-promise_to_pay row) before the first
        // evaluation's write landed: its claim (a conditional UPDATE
        // keyed on the exact next_evaluation_at it read) matches zero
        // rows because the winner already moved it — exactly what a
        // real concurrent Postgres UPDATE...WHERE would produce. Run
        // sequentially (not via Promise.all) so this test's own outcome
        // is deterministic — the property under test is the claim's
        // compare-and-swap logic, not this test's ability to win a real
        // race against itself. ---
        supabaseMock.queueResponse("collection_cases", { data: promiseCase, error: null });
        supabaseMock.queueResponse("collection_cases", { data: null, error: null }); // claim fails

        await expect(
            evaluateOrOpenCollectionCase("cust-idempotent-2")
        ).resolves.toBeUndefined(); // claim failure is a silent no-op, never an error

        // Exactly one send, one activity row, one case-transition update
        // — the losing evaluation wrote nothing at all.
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);
        expect(
            supabaseMock.getCalls("collection_cases").filter((call) => call.method === "update")
        ).toHaveLength(2); // the winner's claim + the winner's applyCaseTransition
    });
});
