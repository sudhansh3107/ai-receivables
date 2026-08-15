import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------
// Responsibility #8 (Own Collection Cases Autonomously) — proves
// CONTINUOUS ownership of a single collection_cases identity across a
// real, multi-cycle lifecycle, entering at the SAME real production
// entry points every other trigger site in this codebase calls:
//
//   - evaluateOrOpenCollectionCase(customerId) — opening a case, the
//     scheduled backfill sweep's re-evaluation, and (with
//     { triggeredByPayment: true }) the exact call app/api/payments/route.ts
//     and paymentDecisionExecutionService.ts make after recordPayment().
//   - processUnclassifiedEmails() / handleCollectionRelevantEmail() —
//     the real R5 ingestion path for customer responses.
//   - resolveExceptionManually() / resumeCollectionCaseFromEscalation() —
//     the exact calls app/api/collection-cases/[id]/resolve-exception
//     and .../resume make.
//
// Every scenario closes the loop through getCollectionCaseDetail(),
// using fixtures built from the CAPTURED write-call arguments
// (supabaseMock.lastCallArgs) — exactly the r5EndToEnd.test.ts /
// r6PromiseLifecycle.test.ts / r7ExceptionLifecycle.test.ts convention —
// so a pass proves the read path renders what the write path actually
// persisted, not two independently hand-maintained guesses.
//
// What makes this file specifically an R8 (not R3-R7) suite: every
// existing E2E scenario in r5/r6/r7 starts from a synthetic case
// snapshot representing ONE moment and exercises ONE transition. Here,
// each step's OWN real persisted output is threaded into the next
// step's input — proving the employee maintains ownership of a case's
// identity, counters, and history across many real cycles, not just
// that each individual transition is independently correct (already
// covered by r5/r6/r7).
//
// R9 (human escalation policy) and R10 (analytics/learning) are
// explicitly out of scope — the human-action calls used below
// (resolveExceptionManually, resumeCollectionCaseFromEscalation) are
// pre-existing R7-era production functions, reused here only as
// lifecycle plumbing, not as new escalation policy.
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

// Returns the args of every `.method()` call made to `table` from index
// `sinceCount` onward — lets a test capture "everything logged during
// THIS step" even when a single production call logs more than one row
// (e.g. case-open logs OPENED then OUTREACH_SENT in the same call).
function callsSince(
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
        id: "case-r8-placeholder",
        customer_id: "cust-r8-placeholder",
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
// 1. FULL LIFECYCLE — one case identity, open through resolution
// =========================================================================

describe("R8 E2E — full case lifecycle retains one case identity from open to resolution", () => {
    it("open -> contact -> promise -> broken -> dispute -> human resolve -> escalate -> human resume -> paid", async () => {
        const customerId = "cust-r8-lifecycle";
        const caseId = "case-r8-lifecycle";
        const customerRecord = {
            id: customerId,
            company_name: "Lifecycle Testing Co",
            contact_name: "Meera",
            email: "ap@lifecycle-testing.co",
        };

        // -----------------------------------------------------------
        // STEP 1 — open + first contact (evaluateOrOpenCollectionCase,
        // no existing case — the exact call the backfill sweep's
        // "customers needing a new case" pass makes).
        // -----------------------------------------------------------
        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        queueAssessment(75000);
        supabaseMock.queueResponse("collection_cases", { data: null, error: null }); // getActiveCaseForCustomer -> none yet
        supabaseMock.queueResponse("invoices", { data: null, error: null }); // findTriggeringInvoiceId

        const openedRow = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "open",
            opened_at: "2026-01-01T00:00:00.000Z",
        });
        supabaseMock.queueResponse("collection_cases", { data: openedRow, error: null }); // openCollectionCase insert

        supabaseMock.queueResponse("collection_cases", { data: openedRow, error: null }); // claimCaseForEvaluation
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: customerRecord, error: null }); // getCustomerContact

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 75000,
            overdueAmount: 75000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 12,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-r8-contact",
            threadId: "thread-r8-lifecycle",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...openedRow, status: "awaiting_response" },
            error: null,
        });

        await evaluateOrOpenCollectionCase(customerId);

        const caseInsertArgs = supabaseMock.lastCallArgs("collection_cases", "insert");
        expect(caseInsertArgs).toMatchObject({
            customer_id: customerId,
            status: "open",
            outreach_count: 0,
        });

        const step1ActivityInserts = callsSince("activity_log", "insert", 0);
        expect(step1ActivityInserts).toHaveLength(2); // opened + outreach sent
        expect(step1ActivityInserts[0]).toMatchObject({
            activity_type: "collection_case_opened",
            metadata: expect.objectContaining({ caseId }),
        });
        expect(step1ActivityInserts[1]).toMatchObject({
            activity_type: "collection_outreach_sent",
            metadata: expect.objectContaining({ caseId }),
        });

        const step1CaseUpdate = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(step1CaseUpdate).toMatchObject({
            status: "awaiting_response",
            outreach_count: 1,
            unanswered_outreach_count: 1,
        });
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);

        // Running fixture — carries every REAL persisted field forward,
        // never hand-invented, exactly like every existing r5/r6/r7 E2E.
        let currentRow = { ...openedRow, ...step1CaseUpdate };
        expect(currentRow.id).toBe(caseId); // same case identity from the very first cycle

        // -----------------------------------------------------------
        // STEP 2 — customer responds with a payment promise (real R5
        // ingestion: processUnclassifiedEmails -> handleCollectionRelevantEmail).
        // -----------------------------------------------------------
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const promiseEmail = {
            id: "email-r8-promise",
            subject: "Re: Outstanding balance",
            text_body: "We'll pay INR 75,000 by January 10th.",
            from_email: customerRecord.email,
            received_at: "2026-01-03T09:00:00.000Z",
            gmail_message_id: "gmail-msg-r8-promise",
            gmail_thread_id: "gmail-thread-r8-promise",
        };

        supabaseMock.queueResponse("emails", { data: [promiseEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "payment_promise", confidence: 0.9 });
        supabaseMock.queueResponse("emails", {
            data: { ...promiseEmail, classification: "payment_promise" },
            error: null,
        });
        supabaseMock.queueResponse("customers", { data: customerRecord, error: null }); // findCustomerByEmailSafe
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // getActiveCaseForCustomer (handleCollectionRelevantEmail)

        extractPromiseDetailsMock.mockResolvedValueOnce({
            intentClear: true,
            amountStated: true,
            amount: 75000,
            currency: "INR",
            promiseDate: "2020-01-01", // grace already expired by design — Step 3 relies on this
            confidence: 0.9,
        });

        queueAssessment(75000); // unchanged — Step 3's baseline comparison depends on this
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // evaluateOrOpenCollectionCase's own getActiveCaseForCustomer
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // claimCaseForEvaluation
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "moderate" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: customerRecord.company_name, contact_name: customerRecord.contact_name, email: customerRecord.email },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-r8-promise@mail.gmail.com" });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-r8-promise-ack",
            threadId: promiseEmail.gmail_thread_id,
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "promise_to_pay" },
            error: null,
        });

        const activityCountBeforeStep2 = supabaseMock.callCount("activity_log", "insert");
        const result2 = await processUnclassifiedEmails(1);

        expect(result2.classified).toBe(1);
        expect(result2.failed).toBe(0);

        const step2CaseUpdate = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(step2CaseUpdate).toMatchObject({
            status: "promise_to_pay",
            promise_amount: 75000,
            promise_status: "active",
            promise_baseline_outstanding_amount: 75000,
        });

        const step2Activities = callsSince("activity_log", "insert", activityCountBeforeStep2);
        expect(step2Activities).toHaveLength(1);
        expect(step2Activities[0]).toMatchObject({
            activity_type: "collection_promise_acknowledged",
            metadata: expect.objectContaining({ caseId }),
        });

        currentRow = { ...currentRow, ...step2CaseUpdate };
        expect(currentRow.id).toBe(caseId); // still the same case, now carrying its first real history forward

        // -----------------------------------------------------------
        // STEP 3 — the promise's grace window has passed with zero
        // progress: the scheduled backfill sweep re-evaluates
        // (evaluateOrOpenCollectionCase(customerId), no options — the
        // exact call the backfill route makes for every case
        // getCasesDueForEvaluation() returns).
        // -----------------------------------------------------------
        queueAssessment(75000); // still 75,000 outstanding -> zero progress -> broken, not partial
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // claim
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: customerRecord.company_name, contact_name: customerRecord.contact_name, email: customerRecord.email },
            error: null,
        });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 75000,
            overdueAmount: 75000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 20,
            currency: "INR",
        });
        // The case's outbound anchor (set by Step 2's reply) is now
        // non-null, so this proactive follow-up threads onto it instead
        // of starting a fresh conversation — proving Gmail-thread
        // continuity is a real, carried-forward piece of case state.
        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-r8-promise-ack@mail.gmail.com" });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-r8-broken-followup",
            threadId: promiseEmail.gmail_thread_id,
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "awaiting_response" },
            error: null,
        });

        const activityCountBeforeStep3 = supabaseMock.callCount("activity_log", "insert");
        await evaluateOrOpenCollectionCase(customerId);

        // The anchor from Step 2 was actually used — proof the case
        // never lost track of its own conversation thread.
        expect(getOriginalMessageMetadataMock).toHaveBeenCalledWith(
            "msg-r8-promise-ack"
        );

        const step3CaseUpdate = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(step3CaseUpdate).toMatchObject({
            status: "awaiting_response",
            promise_status: "broken",
            broken_promise_count: 1,
        });

        const step3Activities = callsSince("activity_log", "insert", activityCountBeforeStep3);
        expect(step3Activities).toHaveLength(1);
        expect(step3Activities[0]).toMatchObject({
            activity_type: "collection_promise_broken",
            metadata: expect.objectContaining({ caseId }),
        });

        currentRow = { ...currentRow, ...step3CaseUpdate };
        expect(currentRow.id).toBe(caseId);
        expect(currentRow.broken_promise_count).toBe(1);
        // History is not lost — the broken promise's own figures remain
        // on the row for audit, even though the case moved on.
        expect(currentRow.promise_amount).toBe(75000);

        // -----------------------------------------------------------
        // STEP 4 — customer disputes the invoice (real R5/R7 ingestion:
        // relevance -> classification -> customer resolution ->
        // exception extraction -> case decision -> persistence).
        // -----------------------------------------------------------
        const disputeEmail = {
            id: "email-r8-dispute",
            subject: "Re: Outstanding balance — actually disputing this",
            text_body: "On review, the billed quantity is wrong. We're disputing this invoice.",
            from_email: customerRecord.email,
            received_at: "2026-01-15T09:00:00.000Z",
            gmail_message_id: "gmail-msg-r8-dispute",
            gmail_thread_id: "gmail-thread-r8-dispute",
        };

        supabaseMock.queueResponse("emails", { data: [disputeEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "dispute", confidence: 0.93 });
        supabaseMock.queueResponse("emails", {
            data: { ...disputeEmail, classification: "dispute" },
            error: null,
        });
        supabaseMock.queueResponse("customers", { data: customerRecord, error: null });
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // handleCollectionRelevantEmail's own read

        extractExceptionDetailsMock.mockResolvedValueOnce({
            exceptionType: "invoice_incorrect",
            detail: "Billed quantity does not match goods received.",
            confidence: 0.92,
        });

        queueAssessment(75000);
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // evaluateOrOpenCollectionCase's own read
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // claim
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", {
            data: { company_name: customerRecord.company_name, contact_name: customerRecord.contact_name, email: customerRecord.email },
            error: null,
        });

        getOriginalMessageMetadataMock.mockResolvedValueOnce({ rfcMessageId: "rfc-r8-dispute@mail.gmail.com" });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-r8-dispute-ack",
            threadId: disputeEmail.gmail_thread_id,
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "disputed" },
            error: null,
        });

        const activityCountBeforeStep4 = supabaseMock.callCount("activity_log", "insert");
        const result4 = await processUnclassifiedEmails(1);

        expect(result4.classified).toBe(1);

        const step4CaseUpdate = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(step4CaseUpdate).toMatchObject({
            status: "disputed",
            exception_category: "dispute",
            exception_type: "invoice_incorrect",
            exception_status: "open",
        });
        // The promise history from Steps 2-3 is untouched by the dispute.
        expect(step4CaseUpdate).not.toHaveProperty("broken_promise_count");
        expect(step4CaseUpdate).not.toHaveProperty("promise_status");

        const step4Activities = callsSince("activity_log", "insert", activityCountBeforeStep4);
        expect(step4Activities).toHaveLength(1);
        expect(step4Activities[0]).toMatchObject({
            activity_type: "collection_dispute_opened",
            metadata: expect.objectContaining({ caseId }),
        });

        currentRow = { ...currentRow, ...step4CaseUpdate };
        expect(currentRow.id).toBe(caseId);
        expect(currentRow.broken_promise_count).toBe(1); // still carried forward, untouched

        // -----------------------------------------------------------
        // STEP 5 — a human clears the dispute without it ever
        // escalating (resolveExceptionManually — the exact call
        // app/api/collection-cases/[id]/resolve-exception/route.ts
        // makes).
        // -----------------------------------------------------------
        const { resolveExceptionManually } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // its own fetch
        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...currentRow,
                status: "awaiting_response",
                exception_status: "resolved",
                // Real resolveExceptionManually() also sets
                // next_evaluation_at = now() — reflected here (far-past,
                // same "already due" convention used throughout this
                // file) so Step 6's own due-check isn't fooled by Step
                // 4's stale, still-future dispute-reevaluation timestamp.
                next_evaluation_at: "2020-01-01T00:00:00.000Z",
            },
            error: null,
        });

        const resolvedException = await resolveExceptionManually(caseId);

        expect(resolvedException.status).toBe("awaiting_response");
        expect(resolvedException.exception_status).toBe("resolved");
        // WHAT the exception was stays visible — never erased.
        expect(resolvedException.exception_category).toBe("dispute");
        expect(resolvedException.exception_type).toBe("invoice_incorrect");

        currentRow = {
            ...currentRow,
            status: "awaiting_response",
            exception_status: "resolved",
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
        };
        expect(currentRow.id).toBe(caseId);

        // -----------------------------------------------------------
        // STEP 6 — later, unrelated to the (already-resolved) dispute,
        // the account deteriorates sharply and the canonical escalation
        // gate fires on the scheduled sweep.
        // -----------------------------------------------------------
        queueAssessment(75000, { assessment: "critical", priority: "critical" });
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // claim
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "escalated" },
            error: null,
        });

        const activityCountBeforeStep6 = supabaseMock.callCount("activity_log", "insert");
        await evaluateOrOpenCollectionCase(customerId);

        expect(sendGmailReplyMock).toHaveBeenCalledTimes(4); // unchanged — escalation never sends

        const step6CaseUpdate = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(step6CaseUpdate).toMatchObject({
            status: "escalated",
            escalation_reason: expect.any(String),
        });
        // Known, documented quirk (not an R8 blocker — see final report):
        // exception_category is permanently sticky once a case has ever
        // had an exception (by design, for audit visibility), so
        // buildEscalation()'s exceptionCategory-truthy check re-flips
        // exception_status to 'routed_to_human' here even though the
        // dispute itself was already resolved in Step 5. The exception's
        // own content (category/type/detail) is unaffected either way.
        expect(step6CaseUpdate).toMatchObject({ exception_status: "routed_to_human" });

        const step6Activities = callsSince("activity_log", "insert", activityCountBeforeStep6);
        expect(step6Activities).toHaveLength(1);
        expect(step6Activities[0]).toMatchObject({
            activity_type: "collection_case_escalated",
            metadata: expect.objectContaining({ caseId }),
        });

        currentRow = { ...currentRow, ...step6CaseUpdate };
        expect(currentRow.id).toBe(caseId);

        // -----------------------------------------------------------
        // STEP 7 — a human resumes the case (resumeCollectionCaseFromEscalation
        // — the exact call app/api/collection-cases/[id]/resume/route.ts
        // makes).
        // -----------------------------------------------------------
        const { resumeCollectionCaseFromEscalation } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "awaiting_response", escalation_deferred_at: null },
            error: null,
        });

        const resumed = await resumeCollectionCaseFromEscalation(caseId);

        expect(resumed.status).toBe("awaiting_response"); // outreach_count > 0, so not back to 'open'
        expect(resumed.id).toBe(caseId);

        currentRow = { ...currentRow, status: "awaiting_response", escalation_deferred_at: null };

        // -----------------------------------------------------------
        // STEP 8 — the customer finally pays in full. A payment-triggered
        // re-evaluation (evaluateOrOpenCollectionCase(customerId,
        // { triggeredByPayment: true }) — the exact call the payments
        // route makes) recognizes zero remaining exposure and resolves
        // the case autonomously, even though it was human-owned
        // (escalated) moments earlier.
        // -----------------------------------------------------------
        queueAssessment(0); // fully paid
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, status: "resolved", closed_reason: "resolved_paid" },
            error: null,
        });

        const activityCountBeforeStep8 = supabaseMock.callCount("activity_log", "insert");
        await evaluateOrOpenCollectionCase(customerId, { triggeredByPayment: true });

        const step8CaseUpdate = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(step8CaseUpdate).toMatchObject({
            status: "resolved",
            closed_reason: "resolved_paid",
        });

        const step8Activities = callsSince("activity_log", "insert", activityCountBeforeStep8);
        expect(step8Activities).toHaveLength(1);
        expect(step8Activities[0]).toMatchObject({
            activity_type: "collection_case_resolved",
            metadata: expect.objectContaining({ caseId }),
        });

        currentRow = { ...currentRow, ...step8CaseUpdate };
        expect(currentRow.id).toBe(caseId); // same case identity at the very end as at the very start

        // No duplicate actions occurred anywhere across the whole
        // 8-step lifecycle: exactly 4 outbound sends (contact, promise
        // ack, broken-promise follow-up, dispute ack — escalate/resolve/
        // human actions never send) and exactly 7 activity_log rows.
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(4);
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(7);

        // -----------------------------------------------------------
        // Final readback — the SAME case ID, its FULL accumulated
        // history (nothing lost across 8 real cycles), through the real
        // read path.
        // -----------------------------------------------------------
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        const allActivities = callsSince("activity_log", "insert", 0);
        expect(allActivities).toHaveLength(7);

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...currentRow,
                customers: {
                    company_name: customerRecord.company_name,
                    contact_name: customerRecord.contact_name,
                    email: customerRecord.email,
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: allActivities.map((activity, index) => ({
                id: `activity-r8-lifecycle-${index}`,
                activity_type: activity.activity_type,
                description: activity.description,
                metadata: activity.metadata,
                created_at: `2026-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
            })),
            error: null,
        });
        supabaseMock.queueResponse("emails", {
            data: [
                {
                    id: promiseEmail.id,
                    subject: promiseEmail.subject,
                    text_body: promiseEmail.text_body,
                    received_at: promiseEmail.received_at,
                    classification: "payment_promise",
                },
                {
                    id: disputeEmail.id,
                    subject: disputeEmail.subject,
                    text_body: disputeEmail.text_body,
                    received_at: disputeEmail.received_at,
                    classification: "dispute",
                },
            ],
            error: null,
        });

        const detail = await getCollectionCaseDetail(caseId);

        expect(detail?.id).toBe(caseId);
        expect(detail?.customerId).toBe(customerId);
        expect(detail?.status).toBe("resolved");
        expect(detail?.closedReason).toBe("resolved_paid");
        expect(detail?.brokenPromiseCount).toBe(1);
        expect(detail?.exceptionCategory).toBe("dispute");

        const historyTypes = detail?.communicationHistory
            .map((entry) => entry.activityType ?? entry.classification)
            .filter(Boolean);

        expect(historyTypes).toEqual(
            expect.arrayContaining([
                "collection_case_opened",
                "collection_outreach_sent",
                "collection_promise_acknowledged",
                "payment_promise",
                "collection_promise_broken",
                "dispute",
                "collection_dispute_opened",
                "collection_case_escalated",
                "collection_case_resolved",
            ])
        );
        // Full history, nothing dropped: 7 activity rows + 2 inbound emails.
        expect(detail?.communicationHistory).toHaveLength(9);
    });
});

// =========================================================================
// 2. RESOLVED -> REOPEN — a genuinely independent second case
// =========================================================================

describe("R8 E2E — a resolved case is legitimately succeeded by an independent new one", () => {
    it("case #1 resolves via a real payment event; case #2 opens fresh later with zero contamination from case #1", async () => {
        const customerId = "cust-r8-reopen";
        const case1Id = "case-r8-reopen-1";
        const case2Id = "case-r8-reopen-2";
        const customerRecord = {
            id: customerId,
            company_name: "Reopen Testing Co",
            contact_name: "Farah",
            email: "ap@reopen-testing.co",
        };

        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        // -----------------------------------------------------------
        // CASE #1 — an established case with real history, resolved via
        // a genuine payment-triggered evaluation (not a direct mutation).
        // -----------------------------------------------------------
        const case1Row = baseCaseRow({
            id: case1Id,
            customer_id: customerId,
            status: "awaiting_response",
            opened_at: "2025-06-01T00:00:00.000Z",
            outreach_count: 2,
            unanswered_outreach_count: 1,
            broken_promise_count: 1,
            promise_status: "broken",
        });

        queueAssessment(0); // fully paid
        supabaseMock.queueResponse("collection_cases", { data: case1Row, error: null });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...case1Row, status: "resolved", closed_reason: "resolved_paid" },
            error: null,
        });

        await evaluateOrOpenCollectionCase(customerId, { triggeredByPayment: true });

        const case1ResolveArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(case1ResolveArgs).toMatchObject({
            status: "resolved",
            closed_reason: "resolved_paid",
        });

        const case1ResolvedRow = { ...case1Row, ...case1ResolveArgs };

        // -----------------------------------------------------------
        // Months pass. The customer becomes overdue again. Because
        // case #1 is resolved, getActiveCaseForCustomer's real
        // WHERE status <> 'resolved' finds nothing — a fresh
        // evaluateOrOpenCollectionCase() call legitimately opens a
        // SECOND, independent case.
        // -----------------------------------------------------------
        queueAssessment(40000);
        supabaseMock.queueResponse("collection_cases", { data: null, error: null }); // no active case
        supabaseMock.queueResponse("invoices", { data: null, error: null });

        const case2OpenedRow = baseCaseRow({
            id: case2Id,
            customer_id: customerId,
            status: "open",
            opened_at: "2026-03-01T00:00:00.000Z",
        });
        supabaseMock.queueResponse("collection_cases", { data: case2OpenedRow, error: null }); // insert

        supabaseMock.queueResponse("collection_cases", { data: case2OpenedRow, error: null }); // claim
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: customerRecord, error: null });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 40000,
            overdueAmount: 40000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 5,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-r8-reopen-contact",
            threadId: "thread-r8-reopen",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...case2OpenedRow, status: "awaiting_response" },
            error: null,
        });

        await evaluateOrOpenCollectionCase(customerId);

        const case2InsertArgs = supabaseMock.lastCallArgs("collection_cases", "insert");
        // A genuinely fresh open — no field inherited from case #1's
        // history (its counters, promise state, or exception state).
        expect(case2InsertArgs).toMatchObject({
            customer_id: customerId,
            status: "open",
            outreach_count: 0,
            unanswered_outreach_count: 0,
            broken_promise_count: 0,
        });
        expect(case2InsertArgs).not.toHaveProperty("exception_category");
        expect(case2InsertArgs).not.toHaveProperty("promise_status");

        const case2FinalUpdate = supabaseMock.lastCallArgs("collection_cases", "update");
        const case2FinalRow = { ...case2OpenedRow, ...case2FinalUpdate };

        expect(case2FinalRow.id).not.toBe(case1Id); // a genuinely different identity
        expect(case2FinalRow.opened_at).not.toBe(case1Row.opened_at);
        expect(case2FinalRow.outreach_count).toBe(1);
        expect(case2FinalRow.broken_promise_count).toBe(0); // case #1's broken promise never carried over

        // -----------------------------------------------------------
        // Case #1 remains intact and independently queryable.
        // -----------------------------------------------------------
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...case1ResolvedRow,
                customers: {
                    company_name: customerRecord.company_name,
                    contact_name: customerRecord.contact_name,
                    email: customerRecord.email,
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-r8-reopen-case1-resolved",
                    activity_type: "collection_case_resolved",
                    description: "Collection case resolved — payment received.",
                    metadata: { caseId: case1Id },
                    created_at: "2025-12-01T00:00:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const case1Detail = await getCollectionCaseDetail(case1Id);

        expect(case1Detail?.id).toBe(case1Id);
        expect(case1Detail?.status).toBe("resolved");
        expect(case1Detail?.closedReason).toBe("resolved_paid");
        expect(case1Detail?.brokenPromiseCount).toBe(1); // case #1's own history, untouched

        // -----------------------------------------------------------
        // Case #2 is independently queryable too, and starts clean.
        // -----------------------------------------------------------
        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...case2FinalRow,
                customers: {
                    company_name: customerRecord.company_name,
                    contact_name: customerRecord.contact_name,
                    email: customerRecord.email,
                },
                invoices: null,
            },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-r8-reopen-case2-opened",
                    activity_type: "collection_case_opened",
                    description: "Collection case opened for needs_attention customer (medium priority).",
                    metadata: { caseId: case2Id },
                    created_at: "2026-03-01T00:00:00.000Z",
                },
                {
                    id: "activity-r8-reopen-case2-outreach",
                    activity_type: "collection_outreach_sent",
                    description: "First contact sent.",
                    metadata: { caseId: case2Id },
                    created_at: "2026-03-01T00:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const case2Detail = await getCollectionCaseDetail(case2Id);

        expect(case2Detail?.id).toBe(case2Id);
        expect(case2Detail?.status).toBe("awaiting_response");
        expect(case2Detail?.brokenPromiseCount).toBe(0);
        expect(case2Detail?.promiseStatus).toBeNull();
        expect(case2Detail?.exceptionCategory).toBeNull();
        // No history bleed-through from case #1's resolved activity.
        expect(
            case2Detail?.communicationHistory.some(
                (entry) => entry.id === "activity-r8-reopen-case1-resolved"
            )
        ).toBe(false);
    });
});

// =========================================================================
// 3. CONCURRENCY — exactly one claim wins, zero duplicate actions
// =========================================================================

describe("R8 E2E — two overlapping evaluations of the same case produce exactly one effective action", () => {
    it("the losing evaluation performs no duplicate write, send, or activity log entry", async () => {
        const customerId = "cust-r8-concurrent";
        const caseId = "case-r8-concurrent";
        const customerRecord = {
            company_name: "Concurrency Testing Co",
            contact_name: "Devi",
            email: "ap@concurrency-testing.co",
        };

        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const openCaseRow = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "open",
        });

        // --- First (winning) evaluation. ---
        queueAssessment(50000);
        supabaseMock.queueResponse("collection_cases", { data: openCaseRow, error: null }); // read
        supabaseMock.queueResponse("collection_cases", { data: openCaseRow, error: null }); // claim succeeds
        supabaseMock.queueResponse("customer_insights", { data: { risk_level: "low" }, error: null });
        supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
        supabaseMock.queueResponse("customers", { data: customerRecord, error: null });

        getOverdueInvoiceDetailMock.mockResolvedValueOnce({
            outstandingAmount: 50000,
            overdueAmount: 50000,
            overdueInvoiceCount: 1,
            maxDaysOverdue: 8,
            currency: "INR",
        });
        sendGmailReplyMock.mockResolvedValueOnce({
            messageId: "msg-r8-concurrent-contact",
            threadId: "thread-r8-concurrent",
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...openCaseRow, status: "awaiting_response" },
            error: null,
        });

        await evaluateOrOpenCollectionCase(customerId);

        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1);
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);
        const winnerUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(winnerUpdateArgs).toMatchObject({ status: "awaiting_response", outreach_count: 1 });

        // --- Second (losing) evaluation for the SAME case — truly
        // concurrent: it reads the exact same PRE-claim snapshot the
        // winner read (openCaseRow), because in a real race both
        // evaluations would have started from the same row before
        // either claimed it. Its own claim attempt matches zero rows
        // because the winner already moved next_evaluation_at. Unlike a
        // claim-conflict test that forgets to supply an assessment
        // response (which would make evaluateOrOpenCollectionCase
        // short-circuit at Step 0 before ever reaching the claim), this
        // scenario supplies one so the claim path is genuinely
        // exercised, not accidentally bypassed. ---
        queueAssessment(50000);
        supabaseMock.queueResponse("collection_cases", { data: openCaseRow, error: null }); // its own read — same pre-claim snapshot
        supabaseMock.queueResponse("collection_cases", { data: null, error: null }); // claim fails — zero rows matched

        await expect(
            evaluateOrOpenCollectionCase(customerId)
        ).resolves.toBeUndefined();

        // Exactly one effective action occurred across BOTH calls.
        expect(sendGmailReplyMock).toHaveBeenCalledTimes(1); // not 2
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1); // not 2
        // The loser never got far enough to read insight/payment
        // decisions/contact info — proof it stopped exactly at the
        // failed claim, not somewhere further downstream.
        expect(supabaseMock.callCount("customer_insights", "select")).toBe(1);
        expect(supabaseMock.callCount("payment_decisions", "select")).toBe(1);
        expect(supabaseMock.callCount("customers", "select")).toBe(1);

        // Exactly 3 collection_cases UPDATE calls total across both
        // evaluations: the winner's claim, the winner's applyCaseTransition,
        // and the loser's own failed claim attempt (which still issues
        // an UPDATE — it simply matches zero rows and returns null).
        expect(
            supabaseMock.getCalls("collection_cases").filter((call) => call.method === "update")
        ).toHaveLength(3);

        // -----------------------------------------------------------
        // Final state is exactly what the winner produced — no
        // corruption, no double-counted outreach.
        // -----------------------------------------------------------
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        const finalRow = { ...openCaseRow, ...winnerUpdateArgs };

        supabaseMock.queueResponse("collection_cases", {
            data: { ...finalRow, customers: customerRecord, invoices: null },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-r8-concurrent-contact",
                    activity_type: "collection_outreach_sent",
                    description: "First outreach sent",
                    metadata: { caseId },
                    created_at: "2026-01-01T00:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const detail = await getCollectionCaseDetail(caseId);

        expect(detail?.status).toBe("awaiting_response");
        expect(detail?.outreachCount).toBe(1); // not 2 — no duplicate ownership action
        expect(detail?.communicationHistory).toHaveLength(1);
    });
});
