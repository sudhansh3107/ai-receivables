import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------
// Responsibility #5 (Understand Customer Responses) — TRUE end-to-end
// coverage of the production flow:
//
//   customer response -> processUnclassifiedEmails() [real]
//     -> evaluateEmailRelevance() [real, pure]
//     -> classifyEmail() [mocked — the only OpenAI boundary here]
//     -> updateEmailClassification() [real, against the mocked DB layer]
//     -> matchPaymentEmail() / handleCollectionRelevantEmail() [real]
//        -> findCustomerByEmail(Safe)() [real]
//        -> attributeEmailToCustomer() [real]
//        -> extractPromiseDetails() / extractExceptionDetails() /
//           extractPaymentDetails() [mocked — the other OpenAI boundary]
//        -> evaluateOrOpenCollectionCase() [real, full decision engine]
//        -> applyCaseTransition() / logActivity() [real]
//     -> getCollectionCaseDetail() [real] — proves the response is
//        actually visible in the case's communication history, not
//        just that the right functions were called.
//
// Unlike the narrower unit-test suites (emailProcessingService.test.ts,
// collectionCaseOrchestrationService.test.ts), this file starts at the
// ACTUAL production entry point (processUnclassifiedEmails) and reads
// back through the ACTUAL production read path
// (getCollectionCaseDetail), and — where the code under test performs a
// write — builds the read-back fixture FROM the captured write-call
// arguments (via supabaseMock.lastCallArgs) rather than a hand-typed
// parallel fixture, so a passing test proves the read path renders
// what the write path actually persisted, not two independently
// hand-maintained guesses that happen to agree.
//
// Only two things are mocked: the OpenAI-backed extraction/classification
// calls (no network/API key in test env) and the Gmail send/metadata
// calls (no real mailbox). Everything else — relevance gate, customer
// resolution, case service, decision engine, activity log, dashboard
// read — is the real production code running against a per-table FIFO
// Supabase mock, the same convention already established in
// collectionCaseOrchestrationService.test.ts.
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
        // Returns the first argument of the LAST call to `method` on
        // `table` — used to build read-back fixtures from what the
        // production code actually wrote (see file header).
        lastCallArgs(table: string, method: string): Record<string, unknown> | undefined {
            const calls = (callLog[table] ?? []).filter(
                (call) => call.method === method
            );
            const last = calls[calls.length - 1];
            return last?.args[0] as Record<string, unknown> | undefined;
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

// Defensive, matches collectionCaseOrchestrationService.test.ts's own
// precedent — with every extraction/classification service mocked
// below, nothing should actually reach this, but it keeps the module
// graph loadable with no OPENAI_API_KEY regardless.
vi.mock("@/lib/openai", () => ({
    openai: {},
}));

// --- The only two real I/O boundaries this suite mocks -----------------

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

const extractPaymentDetailsMock = vi.fn();
vi.mock("./paymentExtractionService", () => ({
    extractPaymentDetails: (...args: unknown[]) =>
        extractPaymentDetailsMock(...args),
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

// Not central to R5's case-context question and not queried by
// getCollectionCaseDetail — mocked away purely to avoid needing a fake
// "employee_activity" table in every scenario below.
const logEmployeeActivityMock = vi.fn();
vi.mock("../EmployeeActivityService", () => ({
    logEmployeeActivity: (...args: unknown[]) => logEmployeeActivityMock(...args),
}));

// Never reached by any scenario below (buildExposureSummary is only
// used by the "contact"/"follow_up" outreach kinds, neither of which
// any of these responses produce), mocked only so the module graph
// loads.
const getOverdueInvoiceDetailMock = vi.fn();
vi.mock("./receivablesMonitoringService", () => ({
    getOverdueInvoiceDetail: (...args: unknown[]) =>
        getOverdueInvoiceDetailMock(...args),
}));

// -----------------------------------------------------------------
// Shared fixtures
// -----------------------------------------------------------------

function baseCollectionCaseRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "case-e2e",
        customer_id: "cust-e2e",
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

function queueAssessment(outstandingAmount = 82000) {
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
    extractPaymentDetailsMock.mockReset();
    sendGmailReplyMock.mockReset();
    getOriginalMessageMetadataMock.mockReset();
    logEmployeeActivityMock.mockReset();
    getOverdueInvoiceDetailMock.mockReset();
    supabaseMock.reset();
});

// =========================================================================
// 1. PAYMENT_PROMISE
// =========================================================================

describe("E2E — PAYMENT_PROMISE", () => {
    it("realistic promise email flows through ingestion, extraction, case linkage, persistence, and is visible in case history", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-promise-e2e",
            subject: "Re: Outstanding balance on your account",
            text_body:
                "Hi, apologies for the delay — we will settle the full outstanding amount of INR 82,000 by September 1st. Thanks for your patience.",
            from_email: "ap@acme-industries.com",
            received_at: "2026-08-14T09:00:00.000Z",
            gmail_message_id: "gmail-msg-promise",
            gmail_thread_id: "gmail-thread-promise",
        };

        // getUnclassifiedEmails()
        supabaseMock.queueResponse("emails", {
            data: [inboundEmail],
            error: null,
        });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_promise",
            confidence: 0.94,
        });

        // updateEmailClassification()
        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_promise" },
            error: null,
        });

        // findCustomerByEmailSafe()
        supabaseMock.queueResponse("customers", {
            data: {
                id: "cust-e2e",
                company_name: "Acme Industries",
                contact_name: "Priya",
                email: "ap@acme-industries.com",
            },
            error: null,
        });

        // attributeEmailToCustomer() — real update, default {data:null,error:null}
        // is fine (no return value used).

        // handleCollectionRelevantEmail's own getActiveCaseForCustomer()
        const caseRow = baseCollectionCaseRow();
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true,
            amountStated: true,
            amount: 82000,
            currency: "INR",
            promiseDate: "2026-09-01",
            confidence: 0.94,
        });

        queueAssessment(82000);
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
            data: {
                company_name: "Acme Industries",
                contact_name: "Priya",
                email: "ap@acme-industries.com",
            },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "rfc-promise@mail.gmail.com",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-ack-promise",
            threadId: "gmail-thread-promise",
        });

        // applyCaseTransition()
        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "promise_to_pay" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        // --- Pipeline outcome -------------------------------------------
        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        // --- Structured understanding actually ran on the email's own
        // content, not something re-derived from the classification alone.
        expect(extractPromiseDetailsMock).toHaveBeenCalledWith({
            subject: inboundEmail.subject,
            textBody: inboundEmail.text_body,
        });

        // --- Deterministic customer/case linkage -------------------------
        const emailUpdateArgs = supabaseMock.lastCallArgs("emails", "update");
        expect(emailUpdateArgs).toMatchObject({ customer_id: "cust-e2e" });

        // --- Persistence: the case transition actually written ----------
        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "promise_to_pay",
            promise_amount: 82000,
            promise_currency: "INR",
            promise_date: "2026-09-01",
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_promise_acknowledged",
            customer_id: "cust-e2e",
        });

        // --- Case-visible communication history --------------------------
        // Read back through the REAL production read path, using
        // fixtures built from what was actually written above — this is
        // the assertion that closes the loop from "the right writes
        // happened" to "a human reviewing this case would actually see
        // this response and the employee's understanding of it".
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
                    id: "activity-promise-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-14T09:05:00.000Z",
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

        const detail = await getCollectionCaseDetail("case-e2e");

        expect(detail).not.toBeNull();
        expect(detail?.status).toBe("promise_to_pay");
        expect(detail?.promiseAmount).toBe(82000);
        expect(detail?.promiseCurrency).toBe("INR");

        const inbound = detail?.communicationHistory.find(
            (entry) => entry.id === inboundEmail.id
        );
        expect(inbound?.direction).toBe("inbound");
        expect(inbound?.classification).toBe("payment_promise");
        expect(inbound?.body).toContain("82,000");

        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-promise-e2e"
        );
        expect(outbound?.direction).toBe("outbound");
        expect(outbound?.activityType).toBe("collection_promise_acknowledged");
    });
});

// =========================================================================
// 2. DISPUTE
// =========================================================================

describe("E2E — DISPUTE", () => {
    it("realistic dispute email flows through ingestion, exception extraction, case linkage, persistence, and is visible in case history", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-dispute-e2e",
            subject: "Invoice INV-3002 — quantity billed is wrong",
            text_body:
                "We received 80 units, not the 100 units billed on this invoice. Please correct the invoice before we can process payment.",
            from_email: "accounts@betalogistics.com",
            received_at: "2026-08-14T10:00:00.000Z",
            gmail_message_id: "gmail-msg-dispute",
            gmail_thread_id: "gmail-thread-dispute",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "dispute",
            confidence: 0.88,
        });

        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "dispute" },
            error: null,
        });

        supabaseMock.queueResponse("customers", {
            data: {
                id: "cust-dispute-e2e",
                company_name: "Beta Logistics",
                contact_name: null,
                email: "accounts@betalogistics.com",
            },
            error: null,
        });

        const caseRow = baseCollectionCaseRow({
            id: "case-dispute-e2e",
            customer_id: "cust-dispute-e2e",
        });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "invoice_incorrect",
            detail: "Customer received 80 units but was billed for 100.",
            confidence: 0.9,
        });

        queueAssessment(30000);
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
            data: {
                company_name: "Beta Logistics",
                contact_name: null,
                email: "accounts@betalogistics.com",
            },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({
            rfcMessageId: "rfc-dispute@mail.gmail.com",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-ack-dispute",
            threadId: "gmail-thread-dispute",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "disputed" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        expect(extractExceptionDetailsMock).toHaveBeenCalledWith({
            subject: inboundEmail.subject,
            textBody: inboundEmail.text_body,
            category: "dispute",
        });

        const emailUpdateArgs = supabaseMock.lastCallArgs("emails", "update");
        expect(emailUpdateArgs).toMatchObject({ customer_id: "cust-dispute-e2e" });

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "disputed",
            exception_category: "dispute",
            exception_type: "invoice_incorrect",
            exception_detail: "Customer received 80 units but was billed for 100.",
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_dispute_opened",
            customer_id: "cust-dispute-e2e",
        });

        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseRow,
                ...caseUpdateArgs,
                customers: {
                    company_name: "Beta Logistics",
                    contact_name: null,
                    email: "accounts@betalogistics.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-dispute-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-14T10:05:00.000Z",
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
                    classification: "dispute",
                },
            ],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-dispute-e2e");

        expect(detail).not.toBeNull();
        expect(detail?.status).toBe("disputed");
        expect(detail?.exceptionCategory).toBe("dispute");
        expect(detail?.exceptionType).toBe("invoice_incorrect");

        const inbound = detail?.communicationHistory.find(
            (entry) => entry.id === inboundEmail.id
        );
        expect(inbound?.classification).toBe("dispute");

        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-dispute-e2e"
        );
        expect(outbound?.activityType).toBe("collection_dispute_opened");
    });
});

// =========================================================================
// 3. PAYMENT_BLOCKER
// =========================================================================

describe("E2E — PAYMENT_BLOCKER", () => {
    it("realistic blocker email flows through ingestion, exception extraction, case linkage, and persistence (no outreach — chasing is paused)", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-blocker-e2e",
            subject: "Payment held up — PO not yet issued",
            text_body:
                "Our finance team hasn't issued the purchase order for this invoice yet. We intend to pay as soon as it clears internally.",
            from_email: "finance@gammacorp.com",
            received_at: "2026-08-14T11:00:00.000Z",
            gmail_message_id: "gmail-msg-blocker",
            gmail_thread_id: "gmail-thread-blocker",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_blocker",
            confidence: 0.91,
        });

        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_blocker" },
            error: null,
        });

        supabaseMock.queueResponse("customers", {
            data: {
                id: "cust-blocker-e2e",
                company_name: "Gamma Corp",
                contact_name: null,
                email: "finance@gammacorp.com",
            },
            error: null,
        });

        const caseRow = baseCollectionCaseRow({
            id: "case-blocker-e2e",
            customer_id: "cust-blocker-e2e",
        });
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "po_issue",
            detail: "Customer's internal PO has not been issued yet.",
            confidence: 0.9,
        });

        queueAssessment(45000);
        supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null });
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

        // applyCaseTransition() — no outreach for an accepted blocker, so
        // no customers()/gmail calls at all past this point.
        supabaseMock.queueResponse("collection_cases", {
            data: { ...caseRow, status: "payment_blocked" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        expect(extractExceptionDetailsMock).toHaveBeenCalledWith({
            subject: inboundEmail.subject,
            textBody: inboundEmail.text_body,
            category: "blocker",
        });

        // No acknowledgment email is sent for an accepted blocker —
        // chasing is silently paused (approved v2 design).
        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        const emailUpdateArgs = supabaseMock.lastCallArgs("emails", "update");
        expect(emailUpdateArgs).toMatchObject({ customer_id: "cust-blocker-e2e" });

        const caseUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(caseUpdateArgs).toMatchObject({
            status: "payment_blocked",
            exception_category: "blocker",
            exception_type: "po_issue",
        });

        const activityInsertArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(activityInsertArgs).toMatchObject({
            activity_type: "collection_blocker_opened",
            customer_id: "cust-blocker-e2e",
        });

        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...caseRow,
                ...caseUpdateArgs,
                customers: {
                    company_name: "Gamma Corp",
                    contact_name: null,
                    email: "finance@gammacorp.com",
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-blocker-e2e",
                    activity_type: activityInsertArgs?.activity_type,
                    description: activityInsertArgs?.description,
                    metadata: activityInsertArgs?.metadata,
                    created_at: "2026-08-14T11:05:00.000Z",
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
                    classification: "payment_blocker",
                },
            ],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-blocker-e2e");

        expect(detail).not.toBeNull();
        expect(detail?.status).toBe("payment_blocked");
        expect(detail?.exceptionCategory).toBe("blocker");
        expect(detail?.exceptionType).toBe("po_issue");

        const inbound = detail?.communicationHistory.find(
            (entry) => entry.id === inboundEmail.id
        );
        expect(inbound?.classification).toBe("payment_blocker");

        const outbound = detail?.communicationHistory.find(
            (entry) => entry.id === "activity-blocker-e2e"
        );
        expect(outbound?.activityType).toBe("collection_blocker_opened");
    });
});

// =========================================================================
// 4. PAYMENT_RECEIVED
// =========================================================================

describe("E2E — PAYMENT_RECEIVED", () => {
    it("attributes the customer, appears in case history, and never mutates collection-case state", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-paid-e2e",
            subject: "Payment sent — INV-2001",
            text_body:
                "We've transferred INR 45,000 today against invoice INV-2001, reference UTR9988776655.",
            from_email: "billing@deltatraders.com",
            received_at: "2026-08-14T12:00:00.000Z",
            gmail_message_id: "gmail-msg-paid",
            gmail_thread_id: "gmail-thread-paid",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_received",
            confidence: 0.97,
        });

        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_received" },
            error: null,
        });

        // logActivity(PAYMENT_CLAIM_RECEIVED) — activity_log insert #1

        // matchPaymentEmail() -> findCustomerByEmail()
        supabaseMock.queueResponse("customers", {
            data: {
                id: "cust-paid-e2e",
                company_name: "Delta Traders",
                email: "billing@deltatraders.com",
            },
            error: null,
        });

        extractPaymentDetailsMock.mockResolvedValueOnce({
            amount: 45000,
            currency: "INR",
            invoiceNumber: "INV-2001",
            paymentDate: "2026-08-14",
            paymentReference: "UTR9988776655",
            confidence: 0.96,
        });

        // matchPaymentEmail() -> findExistingInvoice()
        supabaseMock.queueResponse("invoices", {
            data: {
                id: "inv-2001",
                customer_id: "cust-paid-e2e",
                invoice_number: "INV-2001",
                currency: "INR",
                balance_due: 45000,
                status: "pending",
            },
            error: null,
        });

        // attributeEmailToCustomer() — real update, default response fine.

        // logInvoiceActivity(PAYMENT_CLAIM_MATCHED) — activity_log insert #2

        // persistPaymentDecision() -> select existing by email_id
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null });
        // persistPaymentDecision() -> insert
        supabaseMock.queueResponse("payment_decisions", {
            data: { id: "pd-1", email_id: inboundEmail.id, status: "pending" },
            error: null,
        });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        // --- Customer attribution (the R5 gap this suite guards) --------
        const emailUpdateArgs = supabaseMock.lastCallArgs("emails", "update");
        expect(emailUpdateArgs).toMatchObject({ customer_id: "cust-paid-e2e" });

        // --- Never mutates collection-case state -------------------------
        // payment_received is owned entirely by the payment_decisions
        // pipeline; it must never touch collection_cases at all.
        expect(supabaseMock.getCalls("collection_cases")).toHaveLength(0);

        // --- Case-visible communication history --------------------------
        // The customer already has an active case; this response must
        // show up in it (now that the customer is attributed) even
        // though it did not change the case's status.
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        const preExistingCase = baseCollectionCaseRow({
            id: "case-paid-e2e",
            customer_id: "cust-paid-e2e",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...preExistingCase,
                customers: { company_name: "Delta Traders", contact_name: null, email: "billing@deltatraders.com" },
                invoices: null,
            },
            error: null,
        });
        // No collection_* activity was ever logged for this response —
        // payment_claim_received/payment_claim_matched are not in
        // COLLECTION_ACTIVITY_TYPES, so a real filtered query returns none.
        supabaseMock.queueResponse("activity_log", { data: [], error: null });
        supabaseMock.queueResponse("emails", {
            data: [
                {
                    id: inboundEmail.id,
                    subject: inboundEmail.subject,
                    text_body: inboundEmail.text_body,
                    received_at: inboundEmail.received_at,
                    classification: "payment_received",
                },
            ],
            error: null,
        });

        const detail = await getCollectionCaseDetail("case-paid-e2e");

        expect(detail).not.toBeNull();
        // Case state is completely untouched by this response.
        expect(detail?.status).toBe("awaiting_response");
        expect(detail?.promiseAmount).toBeNull();
        expect(detail?.exceptionCategory).toBeNull();

        const inbound = detail?.communicationHistory.find(
            (entry) => entry.id === inboundEmail.id
        );
        expect(inbound).toBeDefined();
        expect(inbound?.direction).toBe("inbound");
        expect(inbound?.classification).toBe("payment_received");
    });
});

// =========================================================================
// 5. AMBIGUOUS SENDER
// =========================================================================

describe("E2E — ambiguous sender", () => {
    it("abstains safely: classifies the email, but performs no customer attribution and no case linkage/mutation", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-ambiguous-e2e",
            subject: "We'll pay next week",
            text_body: "Just a heads up, payment will go out next week.",
            from_email: "shared-inbox@sharedvendor.com",
            received_at: "2026-08-14T13:00:00.000Z",
            gmail_message_id: "gmail-msg-ambiguous",
            gmail_thread_id: "gmail-thread-ambiguous",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_promise",
            confidence: 0.85,
        });

        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "payment_promise" },
            error: null,
        });

        // findCustomerByEmailSafe() — more than one customer shares this
        // email address; Supabase surfaces this as PGRST116.
        supabaseMock.queueResponse("customers", {
            data: null,
            error: { code: "PGRST116", message: "multiple (or no) rows returned" },
        });

        const result = await processUnclassifiedEmails(1);

        // The email is still classified — relevance/classification are
        // unaffected by downstream linkage ambiguity.
        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        expect(extractPromiseDetailsMock).not.toHaveBeenCalled();
        expect(extractExceptionDetailsMock).not.toHaveBeenCalled();
        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        // Only the classification update touched "emails" — no
        // attribution update was ever attempted.
        const emailUpdates = supabaseMock
            .getCalls("emails")
            .filter((call) => call.method === "update");
        expect(emailUpdates).toHaveLength(1);
        expect(emailUpdates[0].args[0]).not.toHaveProperty("customer_id");

        // No case was ever queried, let alone opened or mutated.
        expect(supabaseMock.getCalls("collection_cases")).toHaveLength(0);
    });
});

// =========================================================================
// 6. CUSTOMER WITH NO ACTIVE CASE
// =========================================================================

describe("E2E — customer resolved but has no active case", () => {
    it("attributes the email to the customer (context recorded) but performs no collection-case action", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-nocase-e2e",
            subject: "Quick question about the invoice",
            text_body: "What's the due date on this invoice again?",
            from_email: "ops@epsilonworks.com",
            received_at: "2026-08-14T14:00:00.000Z",
            gmail_message_id: "gmail-msg-nocase",
            gmail_thread_id: "gmail-thread-nocase",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });

        classifyEmailMock.mockResolvedValueOnce({
            classification: "customer_inquiry",
            confidence: 0.75,
        });

        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "customer_inquiry" },
            error: null,
        });

        supabaseMock.queueResponse("customers", {
            data: {
                id: "cust-nocase-e2e",
                company_name: "Epsilon Works",
                contact_name: null,
                email: "ops@epsilonworks.com",
            },
            error: null,
        });

        // handleCollectionRelevantEmail's own getActiveCaseForCustomer() —
        // no active case for this customer.
        supabaseMock.queueResponse("collection_cases", { data: null, error: null });

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        // Attribution still happens — the customer is a known, resolved
        // fact even without an active case to act on.
        const emailUpdateArgs = supabaseMock.lastCallArgs("emails", "update");
        expect(emailUpdateArgs).toMatchObject({ customer_id: "cust-nocase-e2e" });

        // But no case action occurs: no extraction, no decision-engine
        // read, exactly one collection_cases query (the existence
        // check itself) and nothing more.
        expect(extractPromiseDetailsMock).not.toHaveBeenCalled();
        expect(extractExceptionDetailsMock).not.toHaveBeenCalled();
        expect(sendGmailReplyMock).not.toHaveBeenCalled();
        // Exactly one query touched collection_cases (the existence
        // check itself) — counted by "select" calls, since a single
        // query chain records several method calls (select/eq/neq/
        // maybeSingle), not just one.
        expect(
            supabaseMock
                .getCalls("collection_cases")
                .filter((call) => call.method === "select")
        ).toHaveLength(1);
        expect(supabaseMock.getCalls("customer_receivables_assessments")).toHaveLength(0);
    });
});
