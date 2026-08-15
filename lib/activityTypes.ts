export const ActivityTypes = {
    INVOICE_CREATED: "invoice_created",
    INVOICE_VALIDATED: "invoice_validated",
    INVOICE_UPLOADED: "invoice_uploaded",
    INVOICE_CONFIDENCE_CALCULATED: "invoice_confidence_calculated",

    CUSTOMER_CREATED: "customer_created",
    CUSTOMER_MATCHED: "customer_matched",

    REMINDER_SCHEDULED: "reminder_scheduled",
    REMINDER_SENT: "reminder_sent",

    // Discovery/work events, not financial outcomes — a customer
    // EMAIL CLAIMING a payment is not proof cash was received, and a
    // structurally-matched claim is not a confirmed payment. Never
    // include these in a "completed outcome" count (that remains
    // PAYMENT_RECORDED / INVOICE_PAID only).
    PAYMENT_CLAIM_RECEIVED: "payment_claim_received",
    PAYMENT_CLAIM_MATCHED: "payment_claim_matched",

    // A human explicitly chose "Request Proof" on an unresolved payment
    // claim (see services/server/paymentProofRequestService.ts) — a
    // deterministic reply was sent asking the customer for evidence. The
    // underlying payment_decision remains unresolved; this is a discovery/
    // work event, not a financial outcome.
    PAYMENT_PROOF_REQUESTED: "payment_proof_requested",

    PAYMENT_RECORDED: "payment_recorded",

    INVOICE_PAID: "invoice_paid",
    INVOICE_PARTIALLY_PAID: "invoice_partially_paid",
    INVOICE_OVERDUE: "invoice_overdue",
    CUSTOMER_INSIGHTS_UPDATED: "customer_insights_updated",

    PAYMENT_DECISION_APPROVED: "payment_decision_approved",
    PAYMENT_DECISION_EXECUTED: "payment_decision_executed",
    PAYMENT_DECISION_EXECUTION_FAILED: "payment_decision_execution_failed",

    // A human explicitly chose "Wait" on a pending payment_decision —
    // NOT an approval. See services/server/paymentDecisionExecutionService.ts::
    // deferPaymentDecision(). Sends no email, creates no payment; only
    // hides the decision from the queue for 24 hours via deferred_at.
    PAYMENT_DECISION_DEFERRED: "payment_decision_deferred",

    // The SYSTEM resurfacing a deferred decision after its 24-hour wait
    // elapsed with no proof received — distinct from
    // PAYMENT_DECISION_DEFERRED (the human's WAIT click that started the
    // clock). See services/server/paymentDecisionService.ts::
    // getPendingPaymentDecisions() / logWaitCompletedForResurfacedDecisions().
    // Logged at most once per WAIT cycle (keyed by decisionId + the
    // deferred_at value that started that cycle); a new WAIT click resets
    // deferred_at and makes the next expiry eligible for another event.
    PAYMENT_DECISION_WAIT_COMPLETED: "payment_decision_wait_completed",

    // A pending payment_decision was automatically resolved because its
    // invoice reached balance_due=0 through an actual payment — see
    // services/server/paymentDecisionService.ts::
    // resolvePaymentDecisionsForSettledInvoice(), called from
    // paymentService.ts::recordPayment(). Distinct from PAYMENT_RECORDED/
    // INVOICE_PAID (the financial event itself, always logged
    // unconditionally by recordPayment()) — this is the separate fact
    // that a specific human-attention item no longer needs attention
    // because of that event. Never fabricates a payment_id-to-decision
    // relationship; resolution is invoice-level, not payment-level.
    PAYMENT_DECISION_RESOLVED: "payment_decision_resolved",

    // Responsibility #2 (Monitor Outstanding Receivables) — the employee
    // (re-)assessed a customer's outstanding receivables using the
    // approved deterministic decision matrix. See
    // services/server/receivablesMonitoringService.ts::
    // refreshReceivablesAssessment(). Logged every time that function
    // runs, same cadence convention as CUSTOMER_INSIGHTS_UPDATED.
    RECEIVABLES_ASSESSMENT_UPDATED: "receivables_assessment_updated",

    // Responsibility #3 (Collections & Follow-Up). See
    // services/server/collectionCaseOrchestrationService.ts and
    // services/server/collectionDecisionEngine.ts for exactly when each
    // fires — every value here maps 1:1 to a transition in the approved
    // v2 state machine / canonical escalation gate.
    COLLECTION_CASE_OPENED: "collection_case_opened",
    COLLECTION_OUTREACH_SENT: "collection_outreach_sent",
    COLLECTION_PROMISE_ACKNOWLEDGED: "collection_promise_acknowledged",
    COLLECTION_PROMISE_RECORDED: "collection_promise_recorded",
    COLLECTION_PROMISE_BROKEN: "collection_promise_broken",
    COLLECTION_DISPUTE_OPENED: "collection_dispute_opened",
    COLLECTION_BLOCKER_OPENED: "collection_blocker_opened",
    COLLECTION_EXCEPTION_RESOLVED: "collection_exception_resolved",
    COLLECTION_CASE_ESCALATED: "collection_case_escalated",
    COLLECTION_CASE_RESOLVED: "collection_case_resolved",
    COLLECTION_CASE_RESUMED_BY_HUMAN: "collection_case_resumed_by_human",

    // Responsibility #9 (Escalate to Humans Appropriately). Escalation is
    // NOT terminal — a case can cycle escalated -> human guidance ->
    // active -> escalated again any number of times. Each cycle's own
    // COLLECTION_CASE_ESCALATED row (already logged today) is the
    // durable record of "why"; these two cover the two NEW human-facing
    // events that close or defer a cycle. See
    // collectionCaseService.ts::provideCollectionCaseGuidance() and
    // ::deferCollectionCaseEscalation().
    COLLECTION_CASE_GUIDANCE_PROVIDED: "collection_case_guidance_provided",
    COLLECTION_CASE_ESCALATION_DEFERRED: "collection_case_escalation_deferred",

    // Responsibility #6 (Manage Promises to Pay). See
    // services/server/collectionDecisionEngine.ts::buildPromiseOutcome()
    // for exactly when fulfilled/partial fire (grace-window evaluation,
    // judged against #2's live outstanding-balance truth) and the T4
    // branch of applyLatestResponse() for revised.
    COLLECTION_PROMISE_FULFILLED: "collection_promise_fulfilled",
    COLLECTION_PROMISE_PARTIALLY_FULFILLED: "collection_promise_partially_fulfilled",
    COLLECTION_PROMISE_REVISED: "collection_promise_revised",

    // Responsibility #7 (Handle Disputes / Blockers / Exceptions). See
    // collectionDecisionEngine.ts's T6/T9 branches for exactly when
    // these fire (a new dispute/blocker report while one of the same
    // category is already open — including a dispute superseding an
    // already-open blocker, a genuine category change) vs. a fresh
    // COLLECTION_DISPUTE_OPENED/COLLECTION_BLOCKER_OPENED.
    COLLECTION_DISPUTE_REVISED: "collection_dispute_revised",
    COLLECTION_BLOCKER_REVISED: "collection_blocker_revised",

} as const;

export type ActivityType =
    (typeof ActivityTypes)[keyof typeof ActivityTypes];