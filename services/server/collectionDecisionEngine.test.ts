import { describe, expect, it } from "vitest";
import {
    computeEscalationGate,
    evaluateCollectionCase,
    type AssessmentContext,
    type CaseState,
    type InsightContext,
    type LatestResponse,
} from "./collectionDecisionEngine";

const NOW = new Date("2026-08-20T09:00:00");

function makeCaseState(overrides: Partial<CaseState> = {}): CaseState {
    return {
        id: "case-1",
        customerId: "customer-1",
        status: "open",
        openedAt: new Date("2026-08-20T09:00:00"),
        nextEvaluationAt: new Date("2026-08-20T09:00:00"),
        outreachCount: 0,
        unansweredOutreachCount: 0,
        lastOutreachAt: null,
        promiseAmount: null,
        promiseCurrency: null,
        promiseDate: null,
        promiseConfidence: null,
        promiseStatus: null,
        brokenPromiseCount: 0,
        exceptionCategory: null,
        exceptionType: null,
        exceptionStatus: null,
        exceptionDetail: null,
        exceptionOpenedAt: null,
        ...overrides,
    };
}

function makeAssessment(
    overrides: Partial<AssessmentContext> = {}
): AssessmentContext {
    return {
        assessment: "needs_attention",
        priority: "medium",
        hasOutstanding: true,
        ...overrides,
    };
}

const insight: InsightContext = { riskLevel: "moderate" };

describe("computeEscalationGate — canonical v1 gate", () => {
    it("escalates when assessment is critical, regardless of everything else", () => {
        expect(
            computeEscalationGate({
                assessment: "critical",
                priority: "low",
                unansweredOutreachCount: 0,
                brokenPromiseCount: 0,
                openedAt: NOW,
                now: NOW,
            })
        ).toBe(true);
    });

    it("does not escalate on needs_attention + high priority alone (no repeated-failure evidence)", () => {
        expect(
            computeEscalationGate({
                assessment: "needs_attention",
                priority: "high",
                unansweredOutreachCount: 0,
                brokenPromiseCount: 0,
                openedAt: NOW,
                now: NOW,
            })
        ).toBe(false);
    });

    it("escalates on needs_attention + high + unanswered >= floor (2)", () => {
        expect(
            computeEscalationGate({
                assessment: "needs_attention",
                priority: "high",
                unansweredOutreachCount: 2,
                brokenPromiseCount: 0,
                openedAt: NOW,
                now: NOW,
            })
        ).toBe(true);
    });

    it("escalates on needs_attention + high + broken promises >= floor (2)", () => {
        expect(
            computeEscalationGate({
                assessment: "needs_attention",
                priority: "high",
                unansweredOutreachCount: 0,
                brokenPromiseCount: 2,
                openedAt: NOW,
                now: NOW,
            })
        ).toBe(true);
    });

    it("escalates on needs_attention + high + case age >= 30 days", () => {
        expect(
            computeEscalationGate({
                assessment: "needs_attention",
                priority: "high",
                unansweredOutreachCount: 0,
                brokenPromiseCount: 0,
                openedAt: new Date("2026-07-21T00:00:00"),
                now: new Date("2026-08-20T00:00:00"),
            })
        ).toBe(true);
    });

    it("does not escalate on needs_attention + medium priority even with repeated-failure evidence", () => {
        expect(
            computeEscalationGate({
                assessment: "needs_attention",
                priority: "medium",
                unansweredOutreachCount: 5,
                brokenPromiseCount: 5,
                openedAt: new Date("2026-01-01T00:00:00"),
                now: NOW,
            })
        ).toBe(false);
    });

    it("never references risk_level (not part of the signature) and never escalates from monitor/no_immediate_attention", () => {
        expect(
            computeEscalationGate({
                assessment: "monitor",
                priority: "high",
                unansweredOutreachCount: 10,
                brokenPromiseCount: 10,
                openedAt: new Date("2020-01-01T00:00:00"),
                now: NOW,
            })
        ).toBe(false);
    });
});

describe("Step 0 — universal resolution gate", () => {
    it("resolves with resolved_paid when triggered by a payment event", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "unresponsive" }),
            assessment: makeAssessment({ hasOutstanding: false }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: true,
        });

        expect(result.decision).toBe("resolve");
        expect(result.newStatus).toBe("resolved");
        expect(result.fieldPatch.closedReason).toBe("resolved_paid");
    });

    it("resolves with resolved_no_exposure when not triggered by a payment event", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "payment_blocked" }),
            assessment: makeAssessment({ hasOutstanding: false }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.closedReason).toBe("resolved_no_exposure");
    });

    it("resolves even while escalated (the sole autonomous exit from escalated)", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "escalated" }),
            assessment: makeAssessment({ hasOutstanding: false }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: true,
        });

        expect(result.newStatus).toBe("resolved");
    });

    it("is checked before Step 1 — a dispute email is ignored if the balance is already clear", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-1",
            classification: "dispute",
            classificationConfidence: 0.95,
            receivedAt: NOW,
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment({ hasOutstanding: false }),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("resolve");
    });
});

describe("T2 — open -> contact", () => {
    it("contacts when open and nothing blocks it", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "open" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("contact");
        expect(result.newStatus).toBe("awaiting_response");
        expect(result.fieldPatch.outreachCount).toBe(1);
        expect(result.fieldPatch.unansweredOutreachCount).toBe(1);
        expect(result.outreachContext).toEqual({ kind: "contact" });
    });

    it("waits instead of contacting when a payment_decisions claim is pending", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "open" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: true,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
        expect(result.newStatus).toBe("open");
    });
});

describe("T13/T14/T15 — awaiting_response -> unresponsive -> follow_up/escalate", () => {
    it("waits while the first-response window has not elapsed", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "awaiting_response",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"),
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
        expect(result.newStatus).toBe("awaiting_response");
    });

    it("falls through to unresponsive and follows up (gate not met) in the same pass, with a non-shrinking interval", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "awaiting_response",
                nextEvaluationAt: new Date("2026-08-19T00:00:00"),
                outreachCount: 1,
                unansweredOutreachCount: 1,
            }),
            assessment: makeAssessment({ priority: "medium" }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("follow_up");
        expect(result.newStatus).toBe("unresponsive");
        expect(result.fieldPatch.unansweredOutreachCount).toBe(2);
        const daysUntilNext =
            (result.nextEvaluationAt.getTime() - NOW.getTime()) /
            (1000 * 60 * 60 * 24);
        expect(daysUntilNext).toBeCloseTo(4, 5);
    });

    it("escalates from unresponsive once the gate is satisfied", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "unresponsive",
                unansweredOutreachCount: 2,
            }),
            assessment: makeAssessment({
                assessment: "needs_attention",
                priority: "high",
            }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("escalate");
        expect(result.newStatus).toBe("escalated");
        expect(result.fieldPatch.escalationReason).toBeTruthy();
    });

    it("does NOT escalate merely because one email was ignored", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "unresponsive",
                unansweredOutreachCount: 1,
            }),
            assessment: makeAssessment({
                assessment: "needs_attention",
                priority: "high",
            }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("follow_up");
    });
});

describe("T4 — payment_promise", () => {
    it("accepts a promise at exactly the confidence floor (0.80) with a stated amount", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-2",
            classification: "payment_promise",
            classificationConfidence: 0.9,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: true,
                amount: 420000,
                currency: "INR",
                promiseDate: "2026-08-22",
                confidence: 0.8,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("acknowledge_promise");
        expect(result.newStatus).toBe("promise_to_pay");
        expect(result.fieldPatch.promiseAmount).toBe(420000);
        expect(result.fieldPatch.unansweredOutreachCount).toBe(0);
    });

    it("rejects a promise just below the confidence floor (0.79) — evidence-only, no promise_* write", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-3",
            classification: "payment_promise",
            classificationConfidence: 0.9,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: false,
                amount: null,
                currency: null,
                promiseDate: "2026-08-22",
                confidence: 0.79,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).not.toBe("acknowledge_promise");
        expect(result.fieldPatch.promiseDate).toBeUndefined();
        expect(result.fieldPatch.promiseAmount).toBeUndefined();
    });

    it("accepts a promise with no stated amount — amount stays null, never invented", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-4",
            classification: "payment_promise",
            classificationConfidence: 0.95,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: false,
                amount: null,
                currency: null,
                promiseDate: "2026-08-22",
                confidence: 0.85,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("acknowledge_promise");
        expect(result.fieldPatch.promiseAmount).toBeNull();
    });

    it("rejects when intent is not clear even at high confidence", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-5",
            classification: "payment_promise",
            classificationConfidence: 0.95,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: false,
                amountStated: true,
                amount: 1000,
                currency: "INR",
                promiseDate: "2026-08-22",
                confidence: 0.95,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).not.toBe("acknowledge_promise");
    });

    it("a promise arriving while payment_blocked clears the blocker exception", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-6",
            classification: "payment_promise",
            classificationConfidence: 0.95,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: true,
                amount: 5000,
                currency: "INR",
                promiseDate: "2026-08-25",
                confidence: 0.9,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "payment_blocked",
                exceptionCategory: "blocker",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.newStatus).toBe("promise_to_pay");
        expect(result.fieldPatch.exceptionStatus).toBe("resolved");
    });
});

describe("T18/T19 — promise_to_pay lifecycle", () => {
    it("waits before the promise date + 1 day grace", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-25",
                promiseAmount: 1000,
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW, // 2026-08-20
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
        expect(result.newStatus).toBe("promise_to_pay");
    });

    it("still waits ON the promise date itself (grace = date + 1 day)", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-20",
                promiseAmount: 1000,
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: new Date("2026-08-20T23:00:00"),
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
    });

    it("marks the promise broken and follows up the day after the grace expires — never escalates directly", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-18",
                promiseAmount: 1000,
                promiseCurrency: "INR",
                brokenPromiseCount: 0,
            }),
            assessment: makeAssessment({
                assessment: "critical", // even at critical severity...
            }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW, // 2026-08-20, well past 2026-08-19 grace
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("follow_up");
        expect(result.newStatus).toBe("awaiting_response"); // never "escalated" directly
        expect(result.fieldPatch.promiseStatus).toBe("broken");
        expect(result.fieldPatch.brokenPromiseCount).toBe(1);
        expect(result.outreachContext).toEqual({
            kind: "follow_up",
            missedCommitment: {
                amount: 1000,
                currency: "INR",
                date: "2026-08-18",
            },
        });
    });

    it("a partial payment before the grace expiry keeps the promise active (Step 0 does not resolve when balance remains)", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-25",
                promiseAmount: 1000,
            }),
            assessment: makeAssessment({ hasOutstanding: true }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: true,
        });

        expect(result.decision).toBe("wait");
        expect(result.newStatus).toBe("promise_to_pay");
    });
});

describe("T6/T7/T7b — dispute never auto-escalates", () => {
    const disputeResponse: LatestResponse = {
        emailId: "email-7",
        classification: "dispute",
        classificationConfidence: 0.9,
        receivedAt: NOW,
        exceptionExtraction: {
            exceptionType: "invoice_incorrect",
            detail: "Customer says the invoice double-charges them.",
            confidence: 0.9,
        },
    };

    it("acknowledges once and enters DISPUTED — never escalates on entry", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment({
                assessment: "needs_attention",
                priority: "high",
            }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: disputeResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("acknowledge_exception");
        expect(result.newStatus).toBe("disputed");
    });

    it("self-transitions (stays DISPUTED, silent, no re-send) when the gate is not satisfied at re-evaluation", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "disputed",
                nextEvaluationAt: new Date("2026-08-19T00:00:00"),
                exceptionCategory: "dispute",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment({
                assessment: "needs_attention",
                priority: "medium",
            }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
        expect(result.newStatus).toBe("disputed");
        expect(result.outreachContext).toBeUndefined();
    });

    it("escalates from DISPUTED only once the canonical gate is satisfied", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "disputed",
                nextEvaluationAt: new Date("2026-08-19T00:00:00"),
                exceptionCategory: "dispute",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment({ assessment: "critical" }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("escalate");
        expect(result.fieldPatch.exceptionStatus).toBe("routed_to_human");
    });

    it("dispute precedence: a blocker signal arriving mid-dispute never changes status", () => {
        const blockerResponse: LatestResponse = {
            emailId: "email-8",
            classification: "payment_blocker",
            classificationConfidence: 0.95,
            receivedAt: NOW,
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "disputed",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"),
                exceptionCategory: "dispute",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment({ priority: "medium" }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: blockerResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.newStatus).toBe("disputed");
    });
});

describe("T9/T10/T11 — payment_blocker", () => {
    it("accepts a blocker at/above the classification confidence floor", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-9",
            classification: "payment_blocker",
            classificationConfidence: 0.8,
            receivedAt: NOW,
            exceptionExtraction: {
                exceptionType: "po_issue",
                detail: "Waiting on PO approval.",
                confidence: 0.8,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.newStatus).toBe("payment_blocked");
        expect(result.fieldPatch.exceptionType).toBe("po_issue");
    });

    it("rejects a blocker below the confidence floor — evidence-only", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-10",
            classification: "payment_blocker",
            classificationConfidence: 0.79,
            receivedAt: NOW,
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.newStatus).not.toBe("payment_blocked");
    });

    it("checks the escalation gate BEFORE deciding to check in — gate satisfied escalates instead of sending a check-in", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "payment_blocked",
                nextEvaluationAt: new Date("2026-08-13T00:00:00"),
                exceptionCategory: "blocker",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment({ assessment: "critical" }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("escalate");
    });

    it("sends a check-in (not follow_up/contact) when the interval is due and the gate is not satisfied", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "payment_blocked",
                nextEvaluationAt: new Date("2026-08-13T00:00:00"),
                exceptionCategory: "blocker",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment({ priority: "medium" }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("check_in");
        expect(result.newStatus).toBe("payment_blocked");
        // check-ins are not collection pressure — must not touch
        // unansweredOutreachCount.
        expect(result.fieldPatch.unansweredOutreachCount).toBeUndefined();
    });

    it("does not re-evaluate before the 7-day interval elapses", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "payment_blocked",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"),
                exceptionCategory: "blocker",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment({ assessment: "critical" }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
    });
});

describe("E1/E2 — reminder_response / customer_inquiry", () => {
    it("reminder_response resets unanswered count without changing status", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "unresponsive",
                unansweredOutreachCount: 3,
                nextEvaluationAt: new Date("2026-08-19T00:00:00"),
            }),
            assessment: makeAssessment({
                assessment: "needs_attention",
                priority: "high",
            }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-11",
                classification: "reminder_response",
                classificationConfidence: 0.9,
                receivedAt: NOW,
            },
            now: NOW,
            triggeredByPayment: false,
        });

        // Evidence resets, then falls through to Step 2 — with
        // unansweredOutreachCount now 0, the gate is no longer met.
        expect(result.decision).toBe("follow_up");
        expect(result.newStatus).toBe("unresponsive");
    });

    it("customer_inquiry pushes next evaluation by the grace window and sends nothing", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-12",
                classification: "customer_inquiry",
                classificationConfidence: 0.9,
                receivedAt: NOW,
            },
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
        expect(result.newStatus).toBe("awaiting_response");
        const daysUntilNext =
            (result.nextEvaluationAt.getTime() - NOW.getTime()) /
            (1000 * 60 * 60 * 24);
        expect(daysUntilNext).toBeCloseTo(3, 5);
    });
});

describe("priority pass-through", () => {
    it("never independently computes priority — always mirrors assessment.priority", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "open" }),
            assessment: makeAssessment({ priority: "critical" }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.priority).toBe("critical");
    });
});
