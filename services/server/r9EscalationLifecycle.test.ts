import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------
// Responsibility #9 (Escalate to Humans Appropriately) — end-to-end
// coverage of the escalation LOOP, entering at the SAME real production
// entry points every other trigger site in this codebase calls:
//
//   - evaluateOrOpenCollectionCase(customerId) — the scheduled backfill
//     sweep's re-evaluation (fires the canonical escalation gate), and
//     (with { triggeredByPayment: true }) the exact call
//     app/api/payments/route.ts makes after recordPayment().
//   - processUnclassifiedEmails() / handleCollectionRelevantEmail() —
//     the real R5 ingestion path for customer responses.
//   - provideCollectionCaseGuidance() — the exact call
//     app/api/collection-cases/[id]/provide-guidance/route.ts makes.
//   - deferCollectionCaseEscalation() — the exact call
//     app/api/collection-cases/[id]/wait/route.ts makes.
//   - getDecisionQueue() — the exact call both Mission Control's
//     DecisionFeed and app/decisions/page.tsx make.
//
// Escalation is explicitly NOT modeled as terminal: a case can cycle
// escalated -> human guidance -> active -> escalated again any number
// of times, all under the SAME collection_cases identity. Every
// scenario below either proves that continuity directly (Scenarios 1,
// 3, 8) or proves the guardrails around it (2, 4, 5, 6, 7).
//
// Mocked: OpenAI-backed classification/extraction, Gmail send/metadata,
// and the read-only #2 signal a follow_up-style outreach email's copy
// depends on (getOverdueInvoiceDetail) — never reached by any escalate/
// defer/guidance path here (none of them send outreach), but mocked so
// the module graph loads, same convention as r7/r8's suites. Everything
// else — relevance gate, customer resolution, case service, decision
// engine (including the unmodified canonical escalation gate), activity
// log, decision queue, dashboard read — is real production code against
// a per-table FIFO Supabase mock.
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
        id: "case-r9-placeholder",
        customer_id: "cust-r9-placeholder",
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

// Queues exactly what a bare evaluateOrOpenCollectionCase(customerId)
// call needs, up through and including the escalate decision's
// applyCaseTransition + the NEW getCustomerContact lookup the R9
// guidance-prompt logic added — every escalate call now makes exactly
// this shape of request, regardless of which runCascade branch fired.
function queueEscalationCycle(
    caseRow: Record<string, unknown>,
    customerRecord: Record<string, unknown>,
    assessmentOverrides: Record<string, unknown> = { assessment: "critical", priority: "critical" }
) {
    queueAssessment(50000, assessmentOverrides);
    supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null }); // read
    supabaseMock.queueResponse("collection_cases", { data: caseRow, error: null }); // claim
    supabaseMock.queueResponse("customer_insights", { data: { risk_level: "high" }, error: null });
    supabaseMock.queueResponse("payment_decisions", { data: null, error: null, count: 0 });
    supabaseMock.queueResponse("collection_cases", {
        data: { ...caseRow, status: "escalated" },
        error: null,
    }); // final (applyCaseTransition)
    supabaseMock.queueResponse("customers", { data: customerRecord, error: null }); // getCustomerContact (R9)
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
// SCENARIO 1 — ESCALATION + HUMAN GUIDANCE
// =========================================================================

describe("R9 E2E — Scenario 1: escalation produces a proactive human-guidance prompt; guidance resumes the case", () => {
    it("the canonical gate escalates the case, logs an auditable ask, and provideCollectionCaseGuidance() resumes it with the human's context preserved", async () => {
        const customerId = "cust-r9-guidance";
        const caseId = "case-r9-guidance";
        const customerRecord = {
            company_name: "Guidance Testing Co",
            contact_name: "Aisha",
            email: "ap@guidance-testing.co",
        };

        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const activeCase = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "unresponsive",
            outreach_count: 3,
            unanswered_outreach_count: 2,
        });

        queueEscalationCycle(activeCase, customerRecord);

        await evaluateOrOpenCollectionCase(customerId);

        const escalateUpdateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(escalateUpdateArgs).toMatchObject({
            status: "escalated",
            escalation_reason: expect.any(String),
        });

        const escalateActivityArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(escalateActivityArgs).toMatchObject({
            activity_type: "collection_case_escalated",
        });

        const escalateMetadata = escalateActivityArgs?.metadata as Record<string, unknown>;
        // The proactive ask — durable, auditable, in the SAME row as the
        // escalation event itself (not a second row).
        expect(typeof escalateMetadata.guidancePrompt).toBe("string");
        const guidancePrompt = escalateMetadata.guidancePrompt as string;
        expect(guidancePrompt).toContain("Guidance Testing Co");
        expect(guidancePrompt).toContain(
            "What happened with this case, and how should I proceed?"
        );

        // The same live-feed mechanism (employee_activity) — reused, not
        // a new notification channel — also carries the full prompt.
        expect(logEmployeeActivityMock).toHaveBeenCalledWith(
            expect.objectContaining({ message: guidancePrompt })
        );

        let currentRow = { ...activeCase, ...escalateUpdateArgs };
        expect(currentRow.id).toBe(caseId);
        expect(currentRow.escalation_reason).toBeTruthy();

        // -----------------------------------------------------------
        // A human answers, through the real service entry point.
        // -----------------------------------------------------------
        const { provideCollectionCaseGuidance } = await import(
            "./collectionCaseService"
        );

        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null }); // resumeCollectionCaseFromEscalation's own fetch
        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...currentRow,
                status: "awaiting_response",
                escalation_deferred_at: null,
                next_evaluation_at: "2020-01-01T00:00:00.000Z",
            },
            error: null,
        });

        const guidanceText =
            "The customer said their PO is pending approval. They expect to pay next Wednesday. Follow up with them then.";

        const resumed = await provideCollectionCaseGuidance(caseId, guidanceText);

        expect(resumed.id).toBe(caseId); // same case identity
        expect(resumed.status).toBe("awaiting_response"); // outreach_count > 0 -> awaiting_response, not "open"
        // The escalation this guidance answers is NOT erased.
        expect(resumed.escalation_reason).toBe(currentRow.escalation_reason);
        expect(resumed.escalated_at).toBe(currentRow.escalated_at);

        const guidanceActivityArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(guidanceActivityArgs).toMatchObject({
            activity_type: "collection_case_guidance_provided",
            description: guidanceText,
        });
        const guidanceMetadata = guidanceActivityArgs?.metadata as Record<string, unknown>;
        expect(guidanceMetadata.guidance).toBe(guidanceText);
        expect(guidanceMetadata.caseId).toBe(caseId);
        expect(guidanceMetadata.escalationReason).toBe(currentRow.escalation_reason);

        currentRow = {
            ...currentRow,
            status: "awaiting_response",
            escalation_deferred_at: null,
        };

        // -----------------------------------------------------------
        // Readback — both events visible in the SAME case's history.
        // -----------------------------------------------------------
        const { getCollectionCaseDetail } = await import(
            "./collectionCaseDashboardService"
        );

        supabaseMock.queueResponse("collection_cases", {
            data: { ...currentRow, customers: customerRecord, invoices: null },
            error: null,
        });
        supabaseMock.queueResponse("activity_log", {
            data: [
                {
                    id: "activity-r9-escalated",
                    activity_type: escalateActivityArgs?.activity_type,
                    description: escalateActivityArgs?.description,
                    metadata: escalateActivityArgs?.metadata,
                    created_at: "2026-01-01T00:00:00.000Z",
                },
                {
                    id: "activity-r9-guidance",
                    activity_type: guidanceActivityArgs?.activity_type,
                    description: guidanceActivityArgs?.description,
                    metadata: guidanceActivityArgs?.metadata,
                    created_at: "2026-01-01T00:05:00.000Z",
                },
            ],
            error: null,
        });
        supabaseMock.queueResponse("emails", { data: [], error: null });

        const detail = await getCollectionCaseDetail(caseId);

        expect(detail?.id).toBe(caseId);
        expect(detail?.status).toBe("awaiting_response");
        expect(detail?.escalationReason).toBe(currentRow.escalation_reason);

        const historyTypes = detail?.communicationHistory.map((entry) => entry.activityType);
        expect(historyTypes).toEqual(
            expect.arrayContaining([
                "collection_case_escalated",
                "collection_case_guidance_provided",
            ])
        );
    });
});

// =========================================================================
// SCENARIO 2 — KEEP MONITORING
// =========================================================================

describe("R9 E2E — Scenario 2: Keep Monitoring is auditable and never resumes/resolves the case", () => {
    it("deferCollectionCaseEscalation() logs a human-action activity, preserves escalation state, and sends nothing", async () => {
        const customerId = "cust-r9-defer";
        const caseId = "case-r9-defer";

        const { deferCollectionCaseEscalation } = await import(
            "./collectionCaseService"
        );

        const escalatedCase = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "escalated",
            escalation_reason:
                "Repeated payment commitments have been broken and the escalation gate is now satisfied.",
            escalated_at: "2026-01-01T00:00:00.000Z",
            escalation_evidence: { gate: { assessment: "critical" } },
        });

        supabaseMock.queueResponse("collection_cases", {
            data: { ...escalatedCase, escalation_deferred_at: "2026-01-02T00:00:00.000Z" },
            error: null,
        });

        const result = await deferCollectionCaseEscalation(caseId);

        expect(result.outcome).toBe("deferred");
        expect(result.case.id).toBe(caseId);
        expect(result.case.status).toBe("escalated"); // NOT resolved, NOT resumed
        expect(result.case.escalation_reason).toBe(escalatedCase.escalation_reason);
        expect(result.case.escalation_evidence).toEqual(escalatedCase.escalation_evidence);

        const deferActivityArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(deferActivityArgs).toMatchObject({
            activity_type: "collection_case_escalation_deferred",
        });
        const deferMetadata = deferActivityArgs?.metadata as Record<string, unknown>;
        expect(deferMetadata.caseId).toBe(caseId);
        expect(deferMetadata.escalationReason).toBe(escalatedCase.escalation_reason);

        expect(sendGmailReplyMock).not.toHaveBeenCalled();
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);
    });

    it("a repeated Keep Monitoring click within the 24h window is a no-op and does not log a second activity", async () => {
        const caseId = "case-r9-defer-repeat";

        const { deferCollectionCaseEscalation } = await import(
            "./collectionCaseService"
        );

        const alreadyDeferredCase = baseCaseRow({
            id: caseId,
            customer_id: "cust-r9-defer-repeat",
            status: "escalated",
            escalation_reason: "Case age exceeded the escalation threshold.",
            escalation_deferred_at: new Date().toISOString(), // inside the 24h window
        });

        // The conditional UPDATE matches zero rows (the OR filter already
        // excludes a recently-deferred case) — falls through to the
        // existing-fetch branch.
        supabaseMock.queueResponse("collection_cases", { data: null, error: null });
        supabaseMock.queueResponse("collection_cases", { data: alreadyDeferredCase, error: null });

        const result = await deferCollectionCaseEscalation(caseId);

        expect(result.outcome).toBe("already_deferred");
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);
    });
});

// =========================================================================
// SCENARIO 3 — ESCALATION -> GUIDANCE -> RE-ESCALATION
// =========================================================================

describe("R9 E2E — Scenario 3: the same case escalates, receives guidance, and escalates again with independent evidence", () => {
    it("one case ID survives two full escalation cycles with no history overwritten", async () => {
        const customerId = "cust-r9-cycle";
        const caseId = "case-r9-cycle";
        const customerRecord = {
            company_name: "Cycle Testing Co",
            contact_name: "Rohan",
            email: "ap@cycle-testing.co",
        };

        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );
        const { provideCollectionCaseGuidance } = await import(
            "./collectionCaseService"
        );

        // --- Cycle 1: escalate. ---
        const cycle1Start = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "unresponsive",
            outreach_count: 2,
            unanswered_outreach_count: 2,
        });

        queueEscalationCycle(cycle1Start, customerRecord);
        await evaluateOrOpenCollectionCase(customerId);

        const cycle1EscalateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        const cycle1EscalateActivity = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(cycle1EscalateActivity).toMatchObject({ activity_type: "collection_case_escalated" });

        let currentRow = { ...cycle1Start, ...cycle1EscalateArgs };
        expect(currentRow.id).toBe(caseId);

        // --- Cycle 1: guidance. ---
        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...currentRow,
                status: "awaiting_response",
                escalation_deferred_at: null,
                next_evaluation_at: "2020-01-01T00:00:00.000Z",
            },
            error: null,
        });

        const guidance1Text = "Customer says PO approval is pending.";
        const resumed1 = await provideCollectionCaseGuidance(caseId, guidance1Text);

        expect(resumed1.id).toBe(caseId);
        expect(resumed1.status).toBe("awaiting_response");

        const guidance1Activity = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(guidance1Activity).toMatchObject({
            activity_type: "collection_case_guidance_provided",
            description: guidance1Text,
        });

        currentRow = {
            ...currentRow,
            status: "awaiting_response",
            escalation_deferred_at: null,
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
        };

        // --- Cycle 2: a later, unrelated deterioration re-escalates the
        // SAME case. ---
        queueEscalationCycle(currentRow, customerRecord);
        await evaluateOrOpenCollectionCase(customerId);

        const cycle2EscalateArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        const cycle2EscalateActivity = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(cycle2EscalateActivity).toMatchObject({ activity_type: "collection_case_escalated" });

        // A fresh escalation write, independent of cycle 1's — proven
        // below by both surviving as distinct, separately-queryable
        // activity_log rows (not by wall-clock inequality, which two
        // synchronous evaluations in the same test tick can't reliably
        // guarantee).
        expect(cycle2EscalateActivity).not.toBe(cycle1EscalateActivity);

        currentRow = { ...currentRow, ...cycle2EscalateArgs };
        expect(currentRow.id).toBe(caseId); // same identity, still, after 2 full cycles
        expect(currentRow.status).toBe("escalated");

        // -----------------------------------------------------------
        // Nothing was overwritten: exactly 2 independent escalation
        // rows and exactly 1 guidance row exist in the audit trail.
        // -----------------------------------------------------------
        const allActivityInserts = insertsSince("activity_log", "insert", 0);
        const escalationEntries = allActivityInserts.filter(
            (activity) => activity.activity_type === "collection_case_escalated"
        );
        const guidanceEntries = allActivityInserts.filter(
            (activity) => activity.activity_type === "collection_case_guidance_provided"
        );

        expect(escalationEntries).toHaveLength(2);
        expect(guidanceEntries).toHaveLength(1);
        expect(guidanceEntries[0].description).toBe(guidance1Text);
        // Each escalation activity carries its own distinct metadata —
        // cycle 2's row is not a mutation of cycle 1's.
        expect(escalationEntries[0]).not.toBe(escalationEntries[1]);
    });
});

// =========================================================================
// SCENARIO 4 — ESCALATED CASE RESOLVES THROUGH PAYMENT
// =========================================================================

describe("R9 E2E — Scenario 4: an escalated case still resolves autonomously when payment clears exposure", () => {
    it("the universal resolution gate wins before the escalated early-return, and escalation history survives the resolve", async () => {
        const customerId = "cust-r9-payment";
        const caseId = "case-r9-payment";

        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const escalatedCase = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "escalated",
            escalation_reason: "Dispute remains unresolved and the escalation gate is now satisfied.",
            escalated_at: "2026-01-01T00:00:00.000Z",
            escalation_evidence: { gate: { assessment: "critical", priority: "critical" } },
            exception_category: "dispute",
            exception_type: "invoice_incorrect",
            exception_status: "routed_to_human",
        });

        queueAssessment(0); // fully paid — hasOutstanding = false
        supabaseMock.queueResponse("collection_cases", { data: escalatedCase, error: null }); // getActiveCaseForCustomer
        supabaseMock.queueResponse("collection_cases", {
            data: { ...escalatedCase, status: "resolved", closed_reason: "resolved_paid" },
            error: null,
        }); // resolveCollectionCase

        await evaluateOrOpenCollectionCase(customerId, { triggeredByPayment: true });

        const resolveArgs = supabaseMock.lastCallArgs("collection_cases", "update");
        expect(resolveArgs).toMatchObject({
            status: "resolved",
            closed_reason: "resolved_paid",
        });
        // resolveCollectionCase() never touches escalation_* — proven by
        // its absence from the write itself.
        expect(resolveArgs).not.toHaveProperty("escalation_reason");
        expect(resolveArgs).not.toHaveProperty("escalation_evidence");
        expect(resolveArgs).not.toHaveProperty("escalated_at");

        const finalRow = { ...escalatedCase, ...resolveArgs };
        expect(finalRow.id).toBe(caseId);
        expect(finalRow.escalation_reason).toBe(escalatedCase.escalation_reason);
        expect(finalRow.escalation_evidence).toEqual(escalatedCase.escalation_evidence);
        expect(finalRow.exception_category).toBe("dispute"); // untouched

        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        const resolveActivityArgs = supabaseMock.lastCallArgs("activity_log", "insert");
        expect(resolveActivityArgs).toMatchObject({ activity_type: "collection_case_resolved" });
    });
});

// =========================================================================
// SCENARIO 5 — CUSTOMER EMAIL DURING ESCALATION
// =========================================================================

describe("R9 E2E — Scenario 5: a customer email during escalation never resumes autonomous collection", () => {
    it("processUnclassifiedEmails() classifies/attributes the email but leaves the escalated case untouched", async () => {
        const customerId = "cust-r9-email-escalated";
        const caseId = "case-r9-email-escalated";

        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        const inboundEmail = {
            id: "email-r9-during-escalation",
            subject: "Re: Outstanding balance",
            text_body: "We are looking into this internally.",
            from_email: "ap@escalated-customer.co",
            received_at: "2026-01-05T09:00:00.000Z",
            gmail_message_id: "gmail-msg-r9-escalated",
            gmail_thread_id: "gmail-thread-r9-escalated",
        };

        supabaseMock.queueResponse("emails", { data: [inboundEmail], error: null });
        classifyEmailMock.mockResolvedValueOnce({ classification: "customer_inquiry", confidence: 0.8 });
        supabaseMock.queueResponse("emails", {
            data: { ...inboundEmail, classification: "customer_inquiry" },
            error: null,
        });
        supabaseMock.queueResponse("customers", {
            data: { id: customerId, company_name: "Escalated Customer Co", contact_name: null, email: inboundEmail.from_email },
            error: null,
        });

        const escalatedCase = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "escalated",
            escalation_reason: "No response to repeated outreach and the escalation gate is now satisfied.",
            escalated_at: "2026-01-01T00:00:00.000Z",
        });

        // handleCollectionRelevantEmail's own read.
        supabaseMock.queueResponse("collection_cases", { data: escalatedCase, error: null });
        // evaluateOrOpenCollectionCase's readAssessment, then its own read.
        queueAssessment(50000);
        supabaseMock.queueResponse("collection_cases", { data: escalatedCase, error: null });

        const activityCountBefore = supabaseMock.callCount("activity_log", "insert");
        const updateCountBefore = supabaseMock.callCount("collection_cases", "update");

        const result = await processUnclassifiedEmails(1);

        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);

        // No outreach, no case write, no new activity — the escalated
        // guard fired before any of it.
        expect(sendGmailReplyMock).not.toHaveBeenCalled();
        expect(supabaseMock.callCount("collection_cases", "update")).toBe(updateCountBefore);
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(activityCountBefore);

        // The email itself IS still classified AND attributed to the
        // customer — available for a human reviewing this case's
        // history — even though it had no case effect. Two separate
        // UPDATE calls touch the emails row (classification, then
        // customer_id attribution inside handleCollectionRelevantEmail),
        // so check across all of them rather than assuming either is
        // "last".
        const emailUpdateCalls = supabaseMock
            .getCalls("emails")
            .filter((call) => call.method === "update")
            .map((call) => call.args[0] as Record<string, unknown>);

        expect(
            emailUpdateCalls.some((args) => args.classification === "customer_inquiry")
        ).toBe(true);
        expect(
            emailUpdateCalls.some((args) => args.customer_id === customerId)
        ).toBe(true);
    });
});

// =========================================================================
// SCENARIO 6 — DECISION QUEUE REASON
// =========================================================================

describe("R9 E2E — Scenario 6: the real decision queue surfaces the escalation reason and a navigable case ID", () => {
    it("getDecisionQueue() returns a collection_escalation candidate with the exact escalationReason and actionId", async () => {
        const { getDecisionQueue } = await import("./decisionService");

        const escalatedRow = {
            id: "case-r9-queue",
            customer_id: "cust-r9-queue",
            escalation_reason:
                "Repeated payment commitments have been broken and the escalation gate is now satisfied.",
            escalated_at: "2026-01-01T00:00:00.000Z",
            outreach_count: 4,
            unanswered_outreach_count: 1,
            broken_promise_count: 2,
            exception_type: null,
            exception_detail: null,
            customers: { company_name: "Queue Testing Co" },
        };

        supabaseMock.queueResponse("invoices", { data: [], error: null }); // getInvoicesNeedingReviewDetails
        supabaseMock.queueResponse("reminders", { data: [], error: null }); // getRemindersNeedingAttention
        supabaseMock.queueResponse("collection_cases", { data: [escalatedRow], error: null }); // getEscalatedCollectionCases
        supabaseMock.queueResponse("customer_insights", { data: [], error: null }); // getRiskRankByCustomer

        // Mirrors app/decisions/page.tsx's own call exactly:
        // includePaymentDecisions=false, includeCollectionEscalations=true.
        const queue = await getDecisionQueue(Infinity, false, true);

        const candidate = queue.items.find(
            (item) => item.kind === "collection_escalation"
        );

        expect(candidate).toBeDefined();
        expect(candidate?.reasons).toEqual([escalatedRow.escalation_reason]);
        // The case ID a "Review case" link needs to navigate to
        // /collections/[id].
        expect(candidate?.actionId).toBe(escalatedRow.id);
        expect(candidate?.customerName).toBe("Queue Testing Co");
    });
});

// =========================================================================
// SCENARIO 7 — IDEMPOTENCY
// =========================================================================

describe("R9 E2E — Scenario 7: repeated evaluation and duplicate guidance are both safe", () => {
    it("re-evaluating an already-escalated case is a pure no-op, twice in a row", async () => {
        const customerId = "cust-r9-idempotent";
        const caseId = "case-r9-idempotent";

        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );

        const escalatedCase = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "escalated",
            escalation_reason: "Case age exceeded the escalation threshold.",
            escalated_at: "2026-01-01T00:00:00.000Z",
        });

        queueAssessment(50000);
        supabaseMock.queueResponse("collection_cases", { data: escalatedCase, error: null });

        await evaluateOrOpenCollectionCase(customerId);

        expect(supabaseMock.callCount("collection_cases", "update")).toBe(0);
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);
        expect(sendGmailReplyMock).not.toHaveBeenCalled();

        queueAssessment(50000);
        supabaseMock.queueResponse("collection_cases", { data: escalatedCase, error: null });

        await evaluateOrOpenCollectionCase(customerId);

        expect(supabaseMock.callCount("collection_cases", "update")).toBe(0);
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(0);
        expect(sendGmailReplyMock).not.toHaveBeenCalled();
    });

    it("a duplicate/concurrent guidance submission on the same case is rejected, never double-transitioned", async () => {
        const caseId = "case-r9-duplicate-guidance";

        const { provideCollectionCaseGuidance } = await import(
            "./collectionCaseService"
        );

        const escalatedCase = baseCaseRow({
            id: caseId,
            customer_id: "cust-r9-duplicate-guidance",
            status: "escalated",
            escalation_reason: "Unanswered outreach reached the escalation floor.",
            outreach_count: 5,
        });

        supabaseMock.queueResponse("collection_cases", { data: escalatedCase, error: null }); // fetch
        supabaseMock.queueResponse("collection_cases", {
            data: { ...escalatedCase, status: "awaiting_response", escalation_deferred_at: null },
            error: null,
        }); // conditional update succeeds

        const firstGuidance = await provideCollectionCaseGuidance(caseId, "First guidance.");
        expect(firstGuidance.status).toBe("awaiting_response");

        // Second, concurrent/duplicate submission for the SAME case —
        // its own fetch now sees the ALREADY-resumed row.
        supabaseMock.queueResponse("collection_cases", { data: firstGuidance, error: null });

        await expect(
            provideCollectionCaseGuidance(caseId, "Second guidance.")
        ).rejects.toThrow(/not "escalated"/);

        // Only the FIRST guidance was ever logged.
        expect(supabaseMock.callCount("activity_log", "insert")).toBe(1);
        const guidanceEntries = insertsSince("activity_log", "insert", 0).filter(
            (activity) => activity.activity_type === "collection_case_guidance_provided"
        );
        expect(guidanceEntries).toHaveLength(1);
        expect(guidanceEntries[0].description).toBe("First guidance.");
    });
});

// =========================================================================
// SCENARIO 8 — MULTIPLE GUIDANCE CYCLES
// =========================================================================

describe("R9 E2E — Scenario 8: two full escalate -> guidance -> resume cycles on one case", () => {
    it("both guidance records and both escalation records remain independently auditable, and the case ends in a normal collection state", async () => {
        const customerId = "cust-r9-multicycle";
        const caseId = "case-r9-multicycle";
        const customerRecord = {
            company_name: "Multicycle Testing Co",
            contact_name: "Sana",
            email: "ap@multicycle-testing.co",
        };

        const { evaluateOrOpenCollectionCase } = await import(
            "./collectionCaseOrchestrationService"
        );
        const { provideCollectionCaseGuidance } = await import(
            "./collectionCaseService"
        );

        // --- Cycle 1: escalate -> guidance -> resume. ---
        const start = baseCaseRow({
            id: caseId,
            customer_id: customerId,
            status: "unresponsive",
            outreach_count: 2,
            unanswered_outreach_count: 2,
        });

        queueEscalationCycle(start, customerRecord);
        await evaluateOrOpenCollectionCase(customerId);

        let currentRow = {
            ...start,
            ...supabaseMock.lastCallArgs("collection_cases", "update"),
        };

        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...currentRow,
                status: "awaiting_response",
                escalation_deferred_at: null,
                next_evaluation_at: "2020-01-01T00:00:00.000Z",
            },
            error: null,
        });

        const guidance1Text = "Customer confirmed a PO delay; check back in a week.";
        await provideCollectionCaseGuidance(caseId, guidance1Text);

        currentRow = {
            ...currentRow,
            status: "awaiting_response",
            escalation_deferred_at: null,
            next_evaluation_at: "2020-01-01T00:00:00.000Z",
        };

        // --- Cycle 2: escalate -> guidance -> resume, same case. ---
        queueEscalationCycle(currentRow, customerRecord);
        await evaluateOrOpenCollectionCase(customerId);

        currentRow = {
            ...currentRow,
            ...supabaseMock.lastCallArgs("collection_cases", "update"),
        };
        expect(currentRow.id).toBe(caseId);
        expect(currentRow.status).toBe("escalated");

        supabaseMock.queueResponse("collection_cases", { data: currentRow, error: null });
        supabaseMock.queueResponse("collection_cases", {
            data: {
                ...currentRow,
                status: "awaiting_response",
                escalation_deferred_at: null,
                next_evaluation_at: "2020-01-01T00:00:00.000Z",
            },
            error: null,
        });

        const guidance2Text = "They now committed to paying by Friday.";
        const finalResumed = await provideCollectionCaseGuidance(caseId, guidance2Text);

        expect(finalResumed.id).toBe(caseId); // same identity across BOTH cycles
        // A normal, continuing-ownership state — never stuck escalated,
        // never resolved out from under an unfinished balance.
        expect(finalResumed.status).toBe("awaiting_response");

        // -----------------------------------------------------------
        // Both cycles' evidence independently intact.
        // -----------------------------------------------------------
        const allActivity = insertsSince("activity_log", "insert", 0);
        const escalations = allActivity.filter(
            (activity) => activity.activity_type === "collection_case_escalated"
        );
        const guidances = allActivity.filter(
            (activity) => activity.activity_type === "collection_case_guidance_provided"
        );

        expect(escalations).toHaveLength(2);
        expect(guidances).toHaveLength(2);
        expect(guidances.map((activity) => activity.description)).toEqual([
            guidance1Text,
            guidance2Text,
        ]);
        // Every row, across both cycles, still points at the SAME case.
        for (const activity of [...escalations, ...guidances]) {
            const metadata = activity.metadata as Record<string, unknown>;
            expect(metadata.caseId).toBe(caseId);
        }
    });
});
