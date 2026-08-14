import { toLocalDateString } from "@/lib/date";

// ---------------------------------------------------------------------
// Responsibility #3 (Collections & Follow-Up) — the pure decision
// engine, analogous in spirit and discipline to
// receivablesMonitoringService.ts::computeReceivablesAssessment() for
// Responsibility #2: no I/O, no randomness, same inputs always produce
// the same output. This file must NEVER import "@/lib/supabase" or any
// other I/O client — every fact it needs is passed in by the caller
// (services/server/collectionCaseOrchestrationService.ts), and every
// effect it wants applied comes back out as a plain data patch, never
// executed here.
//
// #2 answers "does this customer/receivable need attention, and how
// severe is it?" — consumed here as an opaque, live-read input
// (`assessment`), never recomputed or reinterpreted. #3 answers "given
// that, and given this case's history, what should the employee do
// next?" — that is the entirety of what this file decides.
//
// This is the FINAL, approved v2 specification — every constant, the
// canonical escalation gate, and every state-machine transition below
// were explicitly corrected and approved across several design review
// rounds. Do not simplify, redesign, or introduce alternative logic.
// ---------------------------------------------------------------------

// -----------------------------------------------------------------
// Finalized v1 constants (all approved — see design history)
// -----------------------------------------------------------------

export const FIRST_RESPONSE_WINDOW_DAYS = 4;
export const UNRESPONSIVE_ESCALATION_FLOOR = 2;
export const BROKEN_PROMISE_ESCALATION_FLOOR = 2;
export const PROMISE_CONFIDENCE_FLOOR = 0.8;
export const BLOCKER_CHECK_IN_INTERVAL_DAYS = 7;
export const DISPUTE_REEVALUATION_INTERVAL_DAYS = 7;
export const INQUIRY_GRACE_WINDOW_DAYS = 3;
export const SHORT_RECHECK_WINDOW_DAYS = 2;
export const CASE_AGE_ESCALATION_THRESHOLD_DAYS = 30;
export const BLOCKER_CLASSIFICATION_CONFIDENCE_FLOOR = 0.8;
export const DEFER_WINDOW_HOURS = 24;

// -----------------------------------------------------------------
// Types
// -----------------------------------------------------------------

export type CaseStatus =
    | "open"
    | "awaiting_response"
    | "promise_to_pay"
    | "payment_blocked"
    | "disputed"
    | "unresponsive"
    | "escalated"
    | "resolved";

export type CollectionDecision =
    | "wait"
    | "contact"
    | "follow_up"
    | "check_in"
    | "acknowledge_promise"
    | "acknowledge_exception"
    | "escalate"
    | "resolve";

export type Assessment =
    | "no_immediate_attention"
    | "monitor"
    | "needs_attention"
    | "critical";

export type Priority = "low" | "medium" | "high" | "critical";

export type PromiseStatus = "active" | "kept" | "broken" | "superseded";

export type ExceptionCategory = "dispute" | "blocker";

export type ExceptionType =
    | "invoice_incorrect"
    | "goods_not_received"
    | "amount_disputed"
    | "po_issue"
    | "approval_pending"
    | "documentation_issue"
    | "vendor_onboarding"
    | "tax_compliance"
    | "blocked_internally"
    | "other";

export type ExceptionStatus = "open" | "routed_to_human" | "resolved";

export type ClosedReason =
    | "resolved_paid"
    | "resolved_no_exposure"
    | "resolved_manual";

// Minimal, decision-relevant projection of a collection_cases row — the
// caller (collectionCaseOrchestrationService.ts) maps the full DB row
// into this shape before calling evaluateCollectionCase().
export interface CaseState {
    id: string;
    customerId: string;
    status: CaseStatus;
    openedAt: Date;
    nextEvaluationAt: Date;

    outreachCount: number;
    unansweredOutreachCount: number;
    lastOutreachAt: Date | null;

    promiseAmount: number | null;
    promiseCurrency: string | null;
    promiseDate: string | null; // YYYY-MM-DD
    promiseConfidence: number | null;
    promiseStatus: PromiseStatus | null;
    brokenPromiseCount: number;

    exceptionCategory: ExceptionCategory | null;
    exceptionType: ExceptionType | null;
    exceptionStatus: ExceptionStatus | null;
    exceptionDetail: string | null;
    exceptionOpenedAt: Date | null;
}

// Only the fields the decision engine actually consumes from #2 — a
// live read, never a stored/duplicated copy. hasOutstanding is derived
// by the caller from #2's own evidence (outstandingAmount > 0), not
// re-derived here.
export interface AssessmentContext {
    assessment: Assessment;
    priority: Priority;
    hasOutstanding: boolean;
}

// Only the fields available from #1 — kept in the contract for
// evidence/audit completeness, but per the approved v2 correction the
// canonical escalation gate does NOT consume risk_level. It is never
// used to branch a decision here; it may only appear inside the
// `evidence` bundle of a result for audit context.
export interface InsightContext {
    riskLevel: string;
}

export type LatestResponseClassification =
    | "payment_promise"
    | "dispute"
    | "payment_blocker"
    | "reminder_response"
    | "customer_inquiry"
    | "invoice_related"
    | "payment_received"
    | "other"
    | "irrelevant";

export interface PromiseExtractionEvidence {
    intentClear: boolean;
    amountStated: boolean;
    amount: number | null;
    currency: string | null;
    promiseDate: string | null; // YYYY-MM-DD
    confidence: number;
}

export interface ExceptionExtractionEvidence {
    exceptionType: ExceptionType;
    detail: string;
    confidence: number;
}

export interface LatestResponse {
    emailId: string;
    classification: LatestResponseClassification;
    classificationConfidence: number;
    receivedAt: Date;
    promiseExtraction?: PromiseExtractionEvidence;
    exceptionExtraction?: ExceptionExtractionEvidence;
}

export interface CollectionDecisionInput {
    caseState: CaseState;
    assessment: AssessmentContext;
    insight: InsightContext;
    pendingPaymentDecision: boolean;
    latestResponse: LatestResponse | null;
    now: Date;
    // Disambiguates closed_reason on autonomous resolution (T3/T16) —
    // true when this evaluation was triggered by paymentService.ts's
    // recordPayment() chain, false otherwise (invoice cancelled/credited,
    // or any other path that made #2 report hasOutstanding=false).
    triggeredByPayment: boolean;
}

// The exact DB fields to persist — collectionCaseService.ts::
// applyCaseTransition() writes this patch verbatim. Keeping the patch
// as plain data (rather than mutating anything) is what keeps this
// module free of I/O.
export interface CaseFieldPatch {
    status: CaseStatus;
    closedAt?: Date;
    closedReason?: ClosedReason;
    lastDecision: CollectionDecision;
    lastDecisionReason: string;
    lastDecisionAt: Date;
    lastActionAt?: Date;
    nextEvaluationAt: Date;

    outreachCount?: number;
    unansweredOutreachCount?: number;
    lastOutreachAt?: Date;

    lastResponseAt?: Date;
    lastResponseClassification?: LatestResponseClassification;
    lastResponseEmailId?: string;

    promiseAmount?: number | null;
    promiseCurrency?: string | null;
    promiseDate?: string | null;
    promiseSourceEmailId?: string | null;
    promiseConfidence?: number | null;
    promiseStatus?: PromiseStatus | null;
    brokenPromiseCount?: number;

    exceptionCategory?: ExceptionCategory | null;
    exceptionType?: ExceptionType | null;
    exceptionStatus?: ExceptionStatus | null;
    exceptionDetail?: string | null;
    exceptionSourceEmailId?: string | null;
    exceptionOpenedAt?: Date | null;

    escalatedAt?: Date;
    escalationReason?: string;
    escalationEvidence?: Record<string, unknown>;
}

export interface CollectionDecisionResult {
    decision: CollectionDecision;
    newStatus: CaseStatus;
    // Always a direct pass-through of assessment.priority — #3 has no
    // independent authority over receivables severity (§ approved
    // boundary between #2 and #3).
    priority: Priority;
    reason: string;
    evidence: Record<string, unknown>;
    nextEvaluationAt: Date;
    fieldPatch: CaseFieldPatch;
    // Non-null only for decisions that require sending an outbound
    // email (contact/follow_up/check_in/acknowledge_promise/
    // acknowledge_exception) — the orchestration layer uses this to
    // pick the right composer. Never populated for wait/escalate/resolve.
    outreachContext?: OutreachContext;
}

export type OutreachContext =
    | { kind: "contact" }
    | {
          kind: "follow_up";
          missedCommitment: {
              amount: number | null;
              currency: string | null;
              date: string;
          } | null;
      }
    | { kind: "check_in" }
    | { kind: "acknowledge_exception"; category: ExceptionCategory }
    | {
          kind: "acknowledge_promise";
          amount: number | null;
          currency: string | null;
          date: string;
      };

// -----------------------------------------------------------------
// Date helpers — calendar-day arithmetic on local date strings,
// mirroring lib/invoiceOverdue.ts's established house style (string
// comparison of YYYY-MM-DD, not raw millisecond Date math) rather than
// inventing a second convention.
// -----------------------------------------------------------------

function addDaysToDateString(dateString: string, days: number): string {
    const [year, month, day] = dateString.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    return toLocalDateString(date);
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date.getTime());
    result.setDate(result.getDate() + days);
    return result;
}

function calendarDaysBetween(later: Date, earlier: Date): number {
    const laterDay = new Date(
        later.getFullYear(),
        later.getMonth(),
        later.getDate()
    );
    const earlierDay = new Date(
        earlier.getFullYear(),
        earlier.getMonth(),
        earlier.getDate()
    );
    return Math.round(
        (laterDay.getTime() - earlierDay.getTime()) / (1000 * 60 * 60 * 24)
    );
}

// -----------------------------------------------------------------
// The canonical escalation gate — ONE implementation, called
// identically from every escalating branch (unresponsive,
// payment_blocked, disputed). This uniformity is structural, not
// conventional: there is no second gate formula anywhere in this file.
//
// Approved v2 correction #11: #1's risk_level is explicitly NOT part of
// this gate. Only #2's live assessment/priority plus case-internal
// counters are consulted — #3 introduces no independent risk scoring.
// -----------------------------------------------------------------

export interface EscalationGateInput {
    assessment: Assessment;
    priority: Priority;
    unansweredOutreachCount: number;
    brokenPromiseCount: number;
    openedAt: Date;
    now: Date;
}

export function computeEscalationGate(input: EscalationGateInput): boolean {
    if (input.assessment === "critical") {
        return true;
    }

    if (input.assessment !== "needs_attention" || input.priority !== "high") {
        return false;
    }

    const caseAgeDays = calendarDaysBetween(input.now, input.openedAt);

    const repeatedFailureEvidence =
        input.unansweredOutreachCount >= UNRESPONSIVE_ESCALATION_FLOOR ||
        input.brokenPromiseCount >= BROKEN_PROMISE_ESCALATION_FLOOR ||
        caseAgeDays >= CASE_AGE_ESCALATION_THRESHOLD_DAYS;

    return repeatedFailureEvidence;
}

// -----------------------------------------------------------------
// Result builders — one per transition, named after the T-number in
// the approved v2 transition table for direct traceability.
// -----------------------------------------------------------------

function baseEvidence(
    caseState: CaseState,
    assessment: AssessmentContext,
    insight: InsightContext
): Record<string, unknown> {
    return {
        status: caseState.status,
        assessment: assessment.assessment,
        priority: assessment.priority,
        riskLevel: insight.riskLevel,
        outreachCount: caseState.outreachCount,
        unansweredOutreachCount: caseState.unansweredOutreachCount,
        brokenPromiseCount: caseState.brokenPromiseCount,
    };
}

// T3 / T8 / T12 / T16 / T17 / T22 — the universal resolution gate,
// checked first, every evaluation, including status='escalated'.
function buildResolution(
    caseState: CaseState,
    assessment: AssessmentContext,
    insight: InsightContext,
    triggeredByPayment: boolean,
    now: Date
): CollectionDecisionResult {
    const closedReason: ClosedReason = triggeredByPayment
        ? "resolved_paid"
        : "resolved_no_exposure";

    const reason = triggeredByPayment
        ? "Customer has no remaining outstanding balance following a recorded payment."
        : "Customer has no remaining outstanding balance (invoice cancelled, credited, or otherwise settled).";

    return {
        decision: "resolve",
        newStatus: "resolved",
        priority: assessment.priority,
        reason,
        evidence: baseEvidence(caseState, assessment, insight),
        nextEvaluationAt: now,
        fieldPatch: {
            status: "resolved",
            closedAt: now,
            closedReason,
            lastDecision: "resolve",
            lastDecisionReason: reason,
            lastDecisionAt: now,
            nextEvaluationAt: now,
            promiseStatus:
                caseState.promiseStatus === "active" ? "kept" : undefined,
            exceptionStatus: caseState.exceptionCategory
                ? "resolved"
                : undefined,
        },
    };
}

// -----------------------------------------------------------------
// Step 1 — apply the latest customer communication, if any.
//
// Returns:
//   - a full CollectionDecisionResult when the response is decisive on
//     its own (payment_promise accepted -> T4, dispute -> T6,
//     payment_blocker accepted -> T9, customer_inquiry/invoice_related
//     -> E2's explicit grace-window override) — Step 2 never runs.
//   - null when the response should only update evidence in place
//     (ambiguous promise, ambiguous blocker while disputed,
//     reminder_response -> E1, payment_received/other/irrelevant) —
//     the caller merges `evidencePatch` into the effective case state
//     and continues to Step 2.
// -----------------------------------------------------------------

interface Step1Outcome {
    result: CollectionDecisionResult | null;
    evidencePatch: Partial<CaseState>;
}

function applyLatestResponse(
    caseState: CaseState,
    assessment: AssessmentContext,
    insight: InsightContext,
    latestResponse: LatestResponse,
    now: Date
): Step1Outcome {
    const { classification } = latestResponse;

    // T4 — payment_promise, accepted or evidence-only.
    if (classification === "payment_promise") {
        const extraction = latestResponse.promiseExtraction;

        const accepted =
            !!extraction &&
            extraction.intentClear &&
            extraction.confidence >= PROMISE_CONFIDENCE_FLOOR &&
            !!extraction.promiseDate;

        if (accepted && extraction) {
            const wasBlocked = caseState.status === "payment_blocked";

            const reason = extraction.amountStated
                ? `Customer committed to pay ${extraction.currency ?? ""} ${extraction.amount} by ${extraction.promiseDate}.`
                : `Customer committed to pay by ${extraction.promiseDate} (amount not stated in the message).`;

            const nextEvaluationAt = new Date(
                `${addDaysToDateString(extraction.promiseDate!, 1)}T00:00:00`
            );

            return {
                result: {
                    decision: "acknowledge_promise",
                    newStatus: "promise_to_pay",
                    priority: assessment.priority,
                    reason,
                    evidence: {
                        ...baseEvidence(caseState, assessment, insight),
                        promiseAmount: extraction.amount,
                        promiseCurrency: extraction.currency,
                        promiseDate: extraction.promiseDate,
                        promiseConfidence: extraction.confidence,
                    },
                    nextEvaluationAt,
                    fieldPatch: {
                        status: "promise_to_pay",
                        lastDecision: "acknowledge_promise",
                        lastDecisionReason: reason,
                        lastDecisionAt: now,
                        lastActionAt: now,
                        nextEvaluationAt,
                        unansweredOutreachCount: 0,
                        lastResponseAt: now,
                        lastResponseClassification: "payment_promise",
                        lastResponseEmailId: latestResponse.emailId,
                        promiseAmount: extraction.amount,
                        promiseCurrency: extraction.currency,
                        promiseDate: extraction.promiseDate,
                        promiseSourceEmailId: latestResponse.emailId,
                        promiseConfidence: extraction.confidence,
                        promiseStatus: "active",
                        exceptionStatus: wasBlocked ? "resolved" : undefined,
                    },
                    outreachContext: {
                        kind: "acknowledge_promise",
                        amount: extraction.amount,
                        currency: extraction.currency,
                        date: extraction.promiseDate!,
                    },
                },
                evidencePatch: {},
            };
        }

        // Ambiguous/insufficient — evidence-only, never writes promise_*.
        return {
            result: null,
            evidencePatch: {
                unansweredOutreachCount: 0,
            },
        };
    }

    // T6 — dispute always overwrites (dispute precedence rule) and is
    // accepted unconditionally.
    if (classification === "dispute") {
        const extraction = latestResponse.exceptionExtraction;
        const exceptionType: ExceptionType = extraction?.exceptionType ?? "other";
        const detail = extraction?.detail ?? "";

        const reason =
            "Customer disputes the debt. Proactive collection pressure paused pending review.";

        const nextEvaluationAt = addDays(
            now,
            DISPUTE_REEVALUATION_INTERVAL_DAYS
        );

        return {
            result: {
                decision: "acknowledge_exception",
                newStatus: "disputed",
                priority: assessment.priority,
                reason,
                evidence: {
                    ...baseEvidence(caseState, assessment, insight),
                    exceptionCategory: "dispute",
                    exceptionType,
                },
                nextEvaluationAt,
                fieldPatch: {
                    status: "disputed",
                    lastDecision: "acknowledge_exception",
                    lastDecisionReason: reason,
                    lastDecisionAt: now,
                    lastActionAt: now,
                    nextEvaluationAt,
                    lastResponseAt: now,
                    lastResponseClassification: "dispute",
                    lastResponseEmailId: latestResponse.emailId,
                    exceptionCategory: "dispute",
                    exceptionType,
                    exceptionStatus: "open",
                    exceptionDetail: detail,
                    exceptionSourceEmailId: latestResponse.emailId,
                    exceptionOpenedAt: now,
                },
                outreachContext: {
                    kind: "acknowledge_exception",
                    category: "dispute",
                },
            },
            evidencePatch: {},
        };
    }

    // T9 — payment_blocker, accepted only when confidence clears the
    // floor AND the case is not already disputed (dispute precedence:
    // a blocker signal arriving mid-dispute never overrides it).
    if (classification === "payment_blocker") {
        if (caseState.status === "disputed") {
            return {
                result: null,
                evidencePatch: {},
            };
        }

        const accepted =
            latestResponse.classificationConfidence >=
            BLOCKER_CLASSIFICATION_CONFIDENCE_FLOOR;

        if (accepted) {
            const extraction = latestResponse.exceptionExtraction;
            const exceptionType: ExceptionType =
                extraction?.exceptionType ?? "other";
            const detail = extraction?.detail ?? "";

            const reason =
                "Customer reported an internal blocker to payment. Chasing paused; a check-in is scheduled instead.";

            const nextEvaluationAt = addDays(
                now,
                BLOCKER_CHECK_IN_INTERVAL_DAYS
            );

            return {
                result: {
                    decision: "wait",
                    newStatus: "payment_blocked",
                    priority: assessment.priority,
                    reason,
                    evidence: {
                        ...baseEvidence(caseState, assessment, insight),
                        exceptionCategory: "blocker",
                        exceptionType,
                    },
                    nextEvaluationAt,
                    fieldPatch: {
                        status: "payment_blocked",
                        lastDecision: "wait",
                        lastDecisionReason: reason,
                        lastDecisionAt: now,
                        nextEvaluationAt,
                        unansweredOutreachCount: 0,
                        lastResponseAt: now,
                        lastResponseClassification: "payment_blocker",
                        lastResponseEmailId: latestResponse.emailId,
                        exceptionCategory: "blocker",
                        exceptionType,
                        exceptionStatus: "open",
                        exceptionDetail: detail,
                        exceptionSourceEmailId: latestResponse.emailId,
                        exceptionOpenedAt: now,
                    },
                },
                evidencePatch: {},
            };
        }

        // Below the confidence floor — evidence-only, never opens the
        // exception slot.
        return {
            result: null,
            evidencePatch: {
                unansweredOutreachCount: 0,
            },
        };
    }

    // E1 — reminder_response: engagement signal, resets silence
    // evidence, no status change, Step 2 still runs.
    if (classification === "reminder_response") {
        return {
            result: null,
            evidencePatch: {
                unansweredOutreachCount: 0,
            },
        };
    }

    // E2 — customer_inquiry / invoice_related: capture, reset silence
    // evidence, and explicitly override timing with the grace window —
    // returns immediately so Step 2's own cascade never fires a
    // follow-up in the same pass right after a question was asked.
    if (
        classification === "customer_inquiry" ||
        classification === "invoice_related"
    ) {
        const reason =
            "Customer asked a question / referenced the invoice. Pausing outreach for a grace window before re-evaluating.";

        const nextEvaluationAt = addDays(now, INQUIRY_GRACE_WINDOW_DAYS);

        return {
            result: {
                decision: "wait",
                newStatus: caseState.status,
                priority: assessment.priority,
                reason,
                evidence: baseEvidence(caseState, assessment, insight),
                nextEvaluationAt,
                fieldPatch: {
                    status: caseState.status,
                    lastDecision: "wait",
                    lastDecisionReason: reason,
                    lastDecisionAt: now,
                    nextEvaluationAt,
                    unansweredOutreachCount: 0,
                    lastResponseAt: now,
                    lastResponseClassification: classification,
                    lastResponseEmailId: latestResponse.emailId,
                },
            },
            evidencePatch: {},
        };
    }

    // E3 / E4 — payment_received (owned entirely by the existing
    // payment_decisions pipeline) / other / irrelevant: no effect.
    return { result: null, evidencePatch: {} };
}

// -----------------------------------------------------------------
// Step 2 — the state-specific cascade. First matching rule wins
// (guard-clause style, matching paymentEmailMatchingService.ts::
// matchPaymentEmail()'s existing precedent for ordered logic — not
// #2's orthogonal-axis matrix style, which doesn't apply here).
// -----------------------------------------------------------------

function runCascade(
    caseState: CaseState,
    assessment: AssessmentContext,
    insight: InsightContext,
    pendingPaymentDecision: boolean,
    now: Date
): CollectionDecisionResult {
    // escalated — defensive path only; escalated cases are excluded
    // from the backfill sweep entirely and only leave via human action
    // or the universal resolution gate above.
    if (caseState.status === "escalated") {
        return buildWaitResult(
            caseState,
            assessment,
            insight,
            "escalated",
            "Case is escalated; awaiting human review.",
            caseState.nextEvaluationAt,
            now
        );
    }

    // disputed — T7 (self, gate not met) / T7b (escalate, gate met).
    if (caseState.status === "disputed") {
        if (now < caseState.nextEvaluationAt) {
            return buildWaitResult(
                caseState,
                assessment,
                insight,
                "disputed",
                "Dispute is open; periodic re-evaluation not yet due.",
                caseState.nextEvaluationAt,
                now
            );
        }

        const gateSatisfied = computeEscalationGate({
            assessment: assessment.assessment,
            priority: assessment.priority,
            unansweredOutreachCount: caseState.unansweredOutreachCount,
            brokenPromiseCount: caseState.brokenPromiseCount,
            openedAt: caseState.openedAt,
            now,
        });

        if (gateSatisfied) {
            return buildEscalation(
                caseState,
                assessment,
                insight,
                now,
                "Dispute remains unresolved and the escalation gate is now satisfied."
            );
        }

        const nextEvaluationAt = addDays(
            now,
            DISPUTE_REEVALUATION_INTERVAL_DAYS
        );

        return buildWaitResult(
            caseState,
            assessment,
            insight,
            "disputed",
            "Dispute re-evaluated; escalation gate not satisfied. Continuing to pause pressure.",
            nextEvaluationAt,
            now
        );
    }

    // promise_to_pay — T18 (self, partial/before grace) / T19 (broken,
    // follow_up).
    if (caseState.status === "promise_to_pay") {
        const graceExpiry = new Date(
            `${addDaysToDateString(caseState.promiseDate!, 1)}T00:00:00`
        );

        if (now < graceExpiry) {
            return buildWaitResult(
                caseState,
                assessment,
                insight,
                "promise_to_pay",
                `Customer committed to pay by ${caseState.promiseDate}; window has not expired.`,
                graceExpiry,
                now
            );
        }

        const reason = `Customer's promised payment date (${caseState.promiseDate}) passed without payment.`;
        const nextEvaluationAt = addDays(now, FIRST_RESPONSE_WINDOW_DAYS);

        return {
            decision: "follow_up",
            newStatus: "awaiting_response",
            priority: assessment.priority,
            reason,
            evidence: {
                ...baseEvidence(caseState, assessment, insight),
                missedPromiseDate: caseState.promiseDate,
                missedPromiseAmount: caseState.promiseAmount,
            },
            nextEvaluationAt,
            fieldPatch: {
                status: "awaiting_response",
                lastDecision: "follow_up",
                lastDecisionReason: reason,
                lastDecisionAt: now,
                lastActionAt: now,
                nextEvaluationAt,
                outreachCount: caseState.outreachCount + 1,
                unansweredOutreachCount: caseState.unansweredOutreachCount + 1,
                lastOutreachAt: now,
                promiseStatus: "broken",
                brokenPromiseCount: caseState.brokenPromiseCount + 1,
            },
            outreachContext: {
                kind: "follow_up",
                missedCommitment: {
                    amount: caseState.promiseAmount,
                    currency: caseState.promiseCurrency,
                    date: caseState.promiseDate!,
                },
            },
        };
    }

    // payment_blocked — T10 (check_in, gate not met) / T11 (escalate,
    // gate met).
    if (caseState.status === "payment_blocked") {
        if (now < caseState.nextEvaluationAt) {
            return buildWaitResult(
                caseState,
                assessment,
                insight,
                "payment_blocked",
                "Blocker check-in interval not yet due.",
                caseState.nextEvaluationAt,
                now
            );
        }

        const gateSatisfied = computeEscalationGate({
            assessment: assessment.assessment,
            priority: assessment.priority,
            unansweredOutreachCount: caseState.unansweredOutreachCount,
            brokenPromiseCount: caseState.brokenPromiseCount,
            openedAt: caseState.openedAt,
            now,
        });

        if (gateSatisfied) {
            return buildEscalation(
                caseState,
                assessment,
                insight,
                now,
                "Blocker persists and the escalation gate is now satisfied."
            );
        }

        const reason =
            "Blocker still unresolved; sending a gentle check-in (not collection pressure).";
        const nextEvaluationAt = addDays(now, BLOCKER_CHECK_IN_INTERVAL_DAYS);

        return {
            decision: "check_in",
            newStatus: "payment_blocked",
            priority: assessment.priority,
            reason,
            evidence: baseEvidence(caseState, assessment, insight),
            nextEvaluationAt,
            fieldPatch: {
                status: "payment_blocked",
                lastDecision: "check_in",
                lastDecisionReason: reason,
                lastDecisionAt: now,
                lastActionAt: now,
                nextEvaluationAt,
                outreachCount: caseState.outreachCount + 1,
                lastOutreachAt: now,
            },
            outreachContext: { kind: "check_in" },
        };
    }

    // From here on: open / awaiting_response / unresponsive. A pending
    // payment claim takes precedence over all three — avoid an
    // awkward "please pay" landing right after the customer said they
    // already paid.
    if (pendingPaymentDecision) {
        return buildWaitResult(
            caseState,
            assessment,
            insight,
            caseState.status,
            "A payment claim for this customer is pending human approval.",
            addDays(now, SHORT_RECHECK_WINDOW_DAYS),
            now
        );
    }

    // open — T2 (contact).
    if (caseState.status === "open") {
        const reason =
            "Customer has an overdue balance requiring attention; initiating first contact.";
        const nextEvaluationAt = addDays(now, FIRST_RESPONSE_WINDOW_DAYS);

        return {
            decision: "contact",
            newStatus: "awaiting_response",
            priority: assessment.priority,
            reason,
            evidence: baseEvidence(caseState, assessment, insight),
            nextEvaluationAt,
            fieldPatch: {
                status: "awaiting_response",
                lastDecision: "contact",
                lastDecisionReason: reason,
                lastDecisionAt: now,
                lastActionAt: now,
                nextEvaluationAt,
                outreachCount: caseState.outreachCount + 1,
                unansweredOutreachCount: caseState.unansweredOutreachCount + 1,
                lastOutreachAt: now,
            },
            outreachContext: { kind: "contact" },
        };
    }

    // awaiting_response — T13 falls through into the unresponsive
    // evaluation below when due; otherwise wait.
    if (caseState.status === "awaiting_response") {
        if (now < caseState.nextEvaluationAt) {
            return buildWaitResult(
                caseState,
                assessment,
                insight,
                "awaiting_response",
                "Awaiting a reply; first-response window has not expired.",
                caseState.nextEvaluationAt,
                now
            );
        }

        return evaluateUnresponsive(caseState, assessment, insight, now);
    }

    // unresponsive — T14 (self, follow_up) / T15 (escalate).
    if (caseState.status === "unresponsive") {
        return evaluateUnresponsive(caseState, assessment, insight, now);
    }

    throw new Error(
        `collectionDecisionEngine: unhandled case status "${caseState.status}"`
    );
}

function evaluateUnresponsive(
    caseState: CaseState,
    assessment: AssessmentContext,
    insight: InsightContext,
    now: Date
): CollectionDecisionResult {
    const gateSatisfied = computeEscalationGate({
        assessment: assessment.assessment,
        priority: assessment.priority,
        unansweredOutreachCount: caseState.unansweredOutreachCount,
        brokenPromiseCount: caseState.brokenPromiseCount,
        openedAt: caseState.openedAt,
        now,
    });

    if (gateSatisfied) {
        return buildEscalation(
            caseState,
            assessment,
            insight,
            now,
            "No response to repeated outreach and the escalation gate is now satisfied."
        );
    }

    const reason =
        "No response yet; sending another follow-up (interval unchanged — only tone/evidence escalate, never the wait time).";
    const nextEvaluationAt = addDays(now, FIRST_RESPONSE_WINDOW_DAYS);

    return {
        decision: "follow_up",
        newStatus: "unresponsive",
        priority: assessment.priority,
        reason,
        evidence: baseEvidence(caseState, assessment, insight),
        nextEvaluationAt,
        fieldPatch: {
            status: "unresponsive",
            lastDecision: "follow_up",
            lastDecisionReason: reason,
            lastDecisionAt: now,
            lastActionAt: now,
            nextEvaluationAt,
            outreachCount: caseState.outreachCount + 1,
            unansweredOutreachCount: caseState.unansweredOutreachCount + 1,
            lastOutreachAt: now,
        },
        outreachContext: {
            kind: "follow_up",
            missedCommitment: null,
        },
    };
}

function buildEscalation(
    caseState: CaseState,
    assessment: AssessmentContext,
    insight: InsightContext,
    now: Date,
    reason: string
): CollectionDecisionResult {
    const evidence = {
        ...baseEvidence(caseState, assessment, insight),
        gate: {
            assessment: assessment.assessment,
            priority: assessment.priority,
            unansweredOutreachCount: caseState.unansweredOutreachCount,
            brokenPromiseCount: caseState.brokenPromiseCount,
            caseAgeDays: calendarDaysBetween(now, caseState.openedAt),
        },
    };

    return {
        decision: "escalate",
        newStatus: "escalated",
        priority: assessment.priority,
        reason,
        evidence,
        nextEvaluationAt: now,
        fieldPatch: {
            status: "escalated",
            lastDecision: "escalate",
            lastDecisionReason: reason,
            lastDecisionAt: now,
            nextEvaluationAt: now,
            escalatedAt: now,
            escalationReason: reason,
            escalationEvidence: evidence,
            exceptionStatus: caseState.exceptionCategory
                ? "routed_to_human"
                : undefined,
        },
    };
}

function buildWaitResult(
    caseState: CaseState,
    assessment: AssessmentContext,
    insight: InsightContext,
    newStatus: CaseStatus,
    reason: string,
    nextEvaluationAt: Date,
    now: Date
): CollectionDecisionResult {
    return {
        decision: "wait",
        newStatus,
        priority: assessment.priority,
        reason,
        evidence: baseEvidence(caseState, assessment, insight),
        nextEvaluationAt,
        fieldPatch: {
            status: newStatus,
            lastDecision: "wait",
            lastDecisionReason: reason,
            lastDecisionAt: now,
            nextEvaluationAt,
        },
    };
}

// -----------------------------------------------------------------
// Entry point.
// -----------------------------------------------------------------

export function evaluateCollectionCase(
    input: CollectionDecisionInput
): CollectionDecisionResult {
    const {
        caseState,
        assessment,
        insight,
        pendingPaymentDecision,
        latestResponse,
        now,
        triggeredByPayment,
    } = input;

    // Step 0 — universal resolution gate, checked first, always,
    // including status === "escalated".
    if (!assessment.hasOutstanding) {
        return buildResolution(
            caseState,
            assessment,
            insight,
            triggeredByPayment,
            now
        );
    }

    // Step 1 — apply the latest customer communication, if any.
    let effectiveCaseState = caseState;

    if (latestResponse) {
        const step1 = applyLatestResponse(
            effectiveCaseState,
            assessment,
            insight,
            latestResponse,
            now
        );

        if (step1.result) {
            return step1.result;
        }

        effectiveCaseState = {
            ...effectiveCaseState,
            ...step1.evidencePatch,
        };
    }

    // Step 2 — state-specific cascade.
    return runCascade(
        effectiveCaseState,
        assessment,
        insight,
        pendingPaymentDecision,
        now
    );
}
