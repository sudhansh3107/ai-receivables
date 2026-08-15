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
        promiseBaselineOutstandingAmount: null,
        exceptionCategory: null,
        exceptionType: null,
        exceptionStatus: null,
        exceptionDetail: null,
        exceptionConfidence: null,
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
        outstandingAmount: 50000,
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

describe("Responsibility #7 — dispute takes precedence over a payment_promise", () => {
    it("a promise arriving while disputed is never accepted into promise_to_pay, and the dispute is never cleared", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-promise-during-dispute",
            classification: "payment_promise",
            classificationConfidence: 0.95,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: true,
                amount: 50000,
                currency: "INR",
                promiseDate: "2026-09-01",
                confidence: 0.95,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "disputed",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"), // not yet due
                exceptionCategory: "dispute",
                exceptionType: "amount_disputed",
                exceptionStatus: "open",
                exceptionDetail: "Customer says the amount is wrong.",
                exceptionOpenedAt: new Date("2026-08-15T00:00:00"),
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        // Status stays disputed — never promise_to_pay.
        expect(result.newStatus).toBe("disputed");
        expect(result.decision).not.toBe("acknowledge_promise");
        // No promise_* field is ever written.
        expect(result.fieldPatch.promiseAmount).toBeUndefined();
        expect(result.fieldPatch.promiseDate).toBeUndefined();
        expect(result.fieldPatch.promiseStatus).toBeUndefined();
        // The dispute is never cleared by the promise.
        expect(result.fieldPatch.exceptionStatus).toBeUndefined();
    });

    it("falls through to Step 2's disputed cascade (still silently waiting, since re-evaluation isn't due) rather than short-circuiting", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-promise-during-dispute-2",
            classification: "payment_promise",
            classificationConfidence: 0.95,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: true,
                amount: 50000,
                currency: "INR",
                promiseDate: "2026-09-01",
                confidence: 0.95,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "disputed",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"),
                exceptionCategory: "dispute",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
        expect(result.outreachContext).toBeUndefined();
    });

    it("a promise arriving while payment_blocked (NOT disputed) is unaffected — existing behavior preserved", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-promise-during-blocker",
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

    it("once the dispute is resolved (status no longer 'disputed'), a later promise is processed normally", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-promise-after-dispute-resolved",
            classification: "payment_promise",
            classificationConfidence: 0.95,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: true,
                amount: 25000,
                currency: "INR",
                promiseDate: "2026-09-01",
                confidence: 0.9,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "awaiting_response", // resolveExceptionManually()'s destination
                exceptionCategory: "dispute",
                exceptionStatus: "resolved",
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("acknowledge_promise");
        expect(result.newStatus).toBe("promise_to_pay");
        expect(result.fieldPatch.promiseAmount).toBe(25000);
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
            promiseOutcome: "broken",
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

describe("Responsibility #6 — promise fulfilment lifecycle", () => {
    it("recognizes full satisfaction EARLY (before the grace window) once the promised amount has actually been paid down", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-09-01", // well after NOW — grace has not started
                promiseAmount: 20000,
                promiseCurrency: "INR",
                promiseBaselineOutstandingAmount: 50000,
            }),
            // #2's live outstandingAmount dropped by 25000 since the
            // promise was made — more than the 20000 promised.
            assessment: makeAssessment({ outstandingAmount: 25000 }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: true,
        });

        expect(result.decision).toBe("follow_up");
        expect(result.newStatus).toBe("awaiting_response");
        expect(result.fieldPatch.promiseStatus).toBe("kept");
        // A fulfilled promise is not a broken one — the counter must
        // never increment for this outcome.
        expect(result.fieldPatch.brokenPromiseCount).toBeUndefined();
        // Resets exactly like an accepted promise — the customer just
        // delivered.
        expect(result.fieldPatch.unansweredOutreachCount).toBe(0);
        expect(result.outreachContext).toEqual({
            kind: "follow_up",
            missedCommitment: null,
            promiseOutcome: "fulfilled",
        });
    });

    it("still recognizes fulfilment at/after grace expiry, not just early — fulfilment is checked before the broken-promise path", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-18", // grace already expired at NOW
                promiseAmount: 1000,
                promiseCurrency: "INR",
                promiseBaselineOutstandingAmount: 50000,
            }),
            assessment: makeAssessment({ outstandingAmount: 48000 }), // 2000 paid
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.promiseStatus).toBe("kept");
        expect(result.fieldPatch.brokenPromiseCount).toBeUndefined();
    });

    it("classifies a shortfall at grace expiry as PARTIAL, not broken, when some (but not all) of the promised amount was paid", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-18",
                promiseAmount: 10000,
                promiseCurrency: "INR",
                promiseBaselineOutstandingAmount: 50000,
                brokenPromiseCount: 0,
            }),
            assessment: makeAssessment({ outstandingAmount: 45000 }), // only 5000 paid
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("follow_up");
        expect(result.newStatus).toBe("awaiting_response");
        expect(result.fieldPatch.promiseStatus).toBe("partial");
        // Partial is not broken — must not count toward the broken-promise
        // escalation floor.
        expect(result.fieldPatch.brokenPromiseCount).toBeUndefined();
        expect(result.fieldPatch.unansweredOutreachCount).toBe(1);
        expect(result.outreachContext).toEqual({
            kind: "follow_up",
            missedCommitment: {
                amount: 10000,
                currency: "INR",
                date: "2026-08-18",
            },
            promiseOutcome: "partial",
        });
    });

    it("classifies zero progress at grace expiry as BROKEN even with an explicit (non-legacy) baseline on record", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-18",
                promiseAmount: 10000,
                promiseCurrency: "INR",
                promiseBaselineOutstandingAmount: 50000,
            }),
            assessment: makeAssessment({ outstandingAmount: 50000 }), // nothing paid
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.promiseStatus).toBe("broken");
        expect(result.fieldPatch.brokenPromiseCount).toBe(1);
    });

    it("date-only promise (no amount stated): any measurable payment progress at grace expiry reads as PARTIAL, not broken", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-18",
                promiseAmount: null,
                promiseCurrency: null,
                promiseBaselineOutstandingAmount: 50000,
            }),
            assessment: makeAssessment({ outstandingAmount: 40000 }), // some progress
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.promiseStatus).toBe("partial");
    });

    it("date-only promise with zero progress at grace expiry still reads as BROKEN", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-18",
                promiseAmount: null,
                promiseCurrency: null,
                promiseBaselineOutstandingAmount: 50000,
            }),
            assessment: makeAssessment({ outstandingAmount: 50000 }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.promiseStatus).toBe("broken");
    });

    it("a legacy case with no baseline snapshot (predating this field) falls back to the pre-#6 broken behavior rather than crashing", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseDate: "2026-08-18",
                promiseAmount: 1000,
                promiseBaselineOutstandingAmount: null,
            }),
            assessment: makeAssessment({ outstandingAmount: 30000 }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.promiseStatus).toBe("broken");
    });

    it("a promise revision (new payment_promise while one is still active) preserves the prior commitment in evidence and resets the baseline to the CURRENT live outstanding figure", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-revision",
            classification: "payment_promise",
            classificationConfidence: 0.92,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: true,
                amount: 60000,
                currency: "INR",
                promiseDate: "2026-09-10",
                confidence: 0.92,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "promise_to_pay",
                promiseStatus: "active",
                promiseAmount: 30000,
                promiseCurrency: "INR",
                promiseDate: "2026-08-22",
                promiseConfidence: 0.85,
                promiseBaselineOutstandingAmount: 70000, // stale baseline from the FIRST promise
            }),
            assessment: makeAssessment({ outstandingAmount: 55000 }), // current live figure
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("acknowledge_promise");
        expect(result.evidence.wasRevision).toBe(true);
        expect(result.evidence.previousPromise).toEqual({
            amount: 30000,
            currency: "INR",
            date: "2026-08-22",
            confidence: 0.85,
        });
        expect(result.fieldPatch.promiseAmount).toBe(60000);
        expect(result.fieldPatch.promiseDate).toBe("2026-09-10");
        // Baseline resets to the CURRENT live figure, never the stale
        // baseline from the superseded promise.
        expect(result.fieldPatch.promiseBaselineOutstandingAmount).toBe(55000);
        expect(result.outreachContext).toMatchObject({
            kind: "acknowledge_promise",
            wasRevision: true,
        });
    });

    it("a fresh promise after a prior one was already broken is NOT treated as a revision", () => {
        const latestResponse: LatestResponse = {
            emailId: "email-fresh",
            classification: "payment_promise",
            classificationConfidence: 0.9,
            receivedAt: NOW,
            promiseExtraction: {
                intentClear: true,
                amountStated: true,
                amount: 15000,
                currency: "INR",
                promiseDate: "2026-09-05",
                confidence: 0.9,
            },
        };

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "awaiting_response",
                promiseStatus: "broken",
                promiseAmount: 10000,
                promiseDate: "2026-08-10",
            }),
            assessment: makeAssessment({ outstandingAmount: 40000 }),
            insight,
            pendingPaymentDecision: false,
            latestResponse,
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.evidence.wasRevision).toBe(false);
        expect(result.evidence.previousPromise).toBeUndefined();
        expect(result.outreachContext).toMatchObject({ wasRevision: false });
    });

    it("buildResolution flips a 'partial' promise to 'kept' once the account fully clears, same as 'active'", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "awaiting_response",
                promiseStatus: "partial",
            }),
            assessment: makeAssessment({ hasOutstanding: false }),
            insight,
            pendingPaymentDecision: false,
            latestResponse: null,
            now: NOW,
            triggeredByPayment: true,
        });

        expect(result.decision).toBe("resolve");
        expect(result.fieldPatch.promiseStatus).toBe("kept");
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

describe("Responsibility #7 — dispute confidence and revisions", () => {
    it("persists exception_confidence from the extraction on a fresh dispute", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-dispute-confidence",
                classification: "dispute",
                classificationConfidence: 0.9,
                receivedAt: NOW,
                exceptionExtraction: {
                    exceptionType: "amount_disputed",
                    detail: "Customer says they were overcharged.",
                    confidence: 0.87,
                },
            },
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.exceptionConfidence).toBe(0.87);
        expect(result.evidence.exceptionConfidence).toBe(0.87);
        expect(result.fieldPatch.exceptionOpenedAt).toEqual(NOW);
        expect(result.evidence.wasRevision).toBe(false);
        expect(result.evidence.previousException).toBeUndefined();
        expect(result.outreachContext).toMatchObject({
            kind: "acknowledge_exception",
            category: "dispute",
            wasRevision: false,
        });
    });

    it("a second dispute report while one is already open (same category) is a REVISION: preserves the original opened_at and the prior report in evidence", () => {
        const originalOpenedAt = new Date("2026-08-10T00:00:00");

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "disputed",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"),
                exceptionCategory: "dispute",
                exceptionType: "invoice_incorrect",
                exceptionStatus: "open",
                exceptionDetail: "Original complaint: wrong quantity billed.",
                exceptionConfidence: 0.75,
                exceptionOpenedAt: originalOpenedAt,
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-dispute-revision",
                classification: "dispute",
                classificationConfidence: 0.9,
                receivedAt: NOW,
                exceptionExtraction: {
                    exceptionType: "amount_disputed",
                    detail: "Now says the total amount is also wrong.",
                    confidence: 0.92,
                },
            },
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("acknowledge_exception");
        expect(result.newStatus).toBe("disputed");
        // The NEW report's facts win going forward...
        expect(result.fieldPatch.exceptionType).toBe("amount_disputed");
        expect(result.fieldPatch.exceptionDetail).toBe(
            "Now says the total amount is also wrong."
        );
        expect(result.fieldPatch.exceptionConfidence).toBe(0.92);
        // ...but opened_at is NEVER overwritten for a same-category
        // revision (absent from the patch entirely, so patchToRow()
        // never touches the column).
        expect(result.fieldPatch.exceptionOpenedAt).toBeUndefined();
        // The prior report is preserved, not silently lost.
        expect(result.evidence.wasRevision).toBe(true);
        expect(result.evidence.previousException).toEqual({
            category: "dispute",
            type: "invoice_incorrect",
            detail: "Original complaint: wrong quantity billed.",
            confidence: 0.75,
            openedAt: originalOpenedAt.toISOString(),
        });
        expect(result.outreachContext).toMatchObject({
            kind: "acknowledge_exception",
            wasRevision: true,
        });
    });

    it("a dispute superseding an already-open BLOCKER is a category change: preserves the blocker in evidence but starts a fresh opened_at (not a same-category revision)", () => {
        const blockerOpenedAt = new Date("2026-08-05T00:00:00");

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "payment_blocked",
                exceptionCategory: "blocker",
                exceptionType: "po_issue",
                exceptionStatus: "open",
                exceptionDetail: "Waiting on internal PO.",
                exceptionConfidence: 0.85,
                exceptionOpenedAt: blockerOpenedAt,
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-category-change",
                classification: "dispute",
                classificationConfidence: 0.9,
                receivedAt: NOW,
                exceptionExtraction: {
                    exceptionType: "goods_not_received",
                    detail: "Actually, we never received the goods at all.",
                    confidence: 0.88,
                },
            },
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.newStatus).toBe("disputed");
        expect(result.fieldPatch.exceptionCategory).toBe("dispute");
        expect(result.fieldPatch.exceptionType).toBe("goods_not_received");
        // A category change is NOT a same-category revision — it starts
        // its own clock, unlike the dispute->dispute case above.
        expect(result.fieldPatch.exceptionOpenedAt).toEqual(NOW);
        // But the superseded blocker is still traceable in evidence —
        // "genuinely different" is handled deterministically, not by
        // silently discarding what was open before.
        expect(result.evidence.wasRevision).toBe(false);
        expect(result.evidence.previousException).toEqual({
            category: "blocker",
            type: "po_issue",
            detail: "Waiting on internal PO.",
            confidence: 0.85,
            openedAt: blockerOpenedAt.toISOString(),
        });
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

describe("Responsibility #7 — blocker confidence and revisions", () => {
    it("persists exception_confidence from the extraction on a fresh blocker", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({ status: "awaiting_response" }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-blocker-confidence",
                classification: "payment_blocker",
                classificationConfidence: 0.85,
                receivedAt: NOW,
                exceptionExtraction: {
                    exceptionType: "approval_pending",
                    detail: "Waiting on internal sign-off.",
                    confidence: 0.82,
                },
            },
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.fieldPatch.exceptionConfidence).toBe(0.82);
        expect(result.evidence.exceptionConfidence).toBe(0.82);
        expect(result.fieldPatch.exceptionOpenedAt).toEqual(NOW);
        expect(result.evidence.wasRevision).toBe(false);
        expect(result.evidence.previousException).toBeUndefined();
    });

    it("a second blocker report while one is already open is a REVISION: preserves the original opened_at and the prior report in evidence", () => {
        const originalOpenedAt = new Date("2026-08-10T00:00:00");

        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "payment_blocked",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"),
                exceptionCategory: "blocker",
                exceptionType: "po_issue",
                exceptionStatus: "open",
                exceptionDetail: "Waiting on PO approval.",
                exceptionConfidence: 0.8,
                exceptionOpenedAt: originalOpenedAt,
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-blocker-revision",
                classification: "payment_blocker",
                classificationConfidence: 0.9,
                receivedAt: NOW,
                exceptionExtraction: {
                    exceptionType: "documentation_issue",
                    detail: "PO cleared, now missing a compliance document.",
                    confidence: 0.86,
                },
            },
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.decision).toBe("wait");
        expect(result.newStatus).toBe("payment_blocked");
        expect(result.fieldPatch.exceptionType).toBe("documentation_issue");
        expect(result.fieldPatch.exceptionConfidence).toBe(0.86);
        // opened_at never overwritten for a same-category revision.
        expect(result.fieldPatch.exceptionOpenedAt).toBeUndefined();
        expect(result.evidence.wasRevision).toBe(true);
        expect(result.evidence.previousException).toEqual({
            category: "blocker",
            type: "po_issue",
            detail: "Waiting on PO approval.",
            confidence: 0.8,
            openedAt: originalOpenedAt.toISOString(),
        });
    });

    it("a blocker can never revise an open DISPUTE (dispute precedence, unchanged) — no exception fields are touched at all", () => {
        const result = evaluateCollectionCase({
            caseState: makeCaseState({
                status: "disputed",
                nextEvaluationAt: new Date("2026-08-25T00:00:00"),
                exceptionCategory: "dispute",
                exceptionType: "invoice_incorrect",
                exceptionStatus: "open",
            }),
            assessment: makeAssessment(),
            insight,
            pendingPaymentDecision: false,
            latestResponse: {
                emailId: "email-blocker-vs-dispute",
                classification: "payment_blocker",
                classificationConfidence: 0.95,
                receivedAt: NOW,
                exceptionExtraction: {
                    exceptionType: "po_issue",
                    detail: "Also waiting on a PO.",
                    confidence: 0.9,
                },
            },
            now: NOW,
            triggeredByPayment: false,
        });

        expect(result.newStatus).toBe("disputed");
        expect(result.fieldPatch.exceptionCategory).toBeUndefined();
        expect(result.fieldPatch.exceptionType).toBeUndefined();
        expect(result.fieldPatch.exceptionConfidence).toBeUndefined();
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
