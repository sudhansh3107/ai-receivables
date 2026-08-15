import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PaymentEmailMatchResult } from "./paymentEmailMatchingService";

// Responsibility #5 (Understand Customer Responses) — covers the
// payment_received customer-linkage gap: matchPaymentEmail() often
// resolves a customerId (by exact sender-email match) even when the
// rest of the payment claim can't be matched, but that customer was
// never attributed back onto the emails row, so the response never
// showed up in the customer's collection case communication history
// (getCollectionCaseDetail() joins on emails.customer_id). These tests
// pin the fix: attributeEmailToCustomer() is called whenever
// matchResult carries a customerId, and never blocks
// persistPaymentDecision() if it fails.

const getUnclassifiedEmailsMock = vi.fn();
const updateEmailClassificationMock = vi.fn();
const markEmailClassificationFailedMock = vi.fn();
const markEmailIgnoredMock = vi.fn();
const attributeEmailToCustomerMock = vi.fn();

vi.mock("@/services/server/emailService", () => ({
    getUnclassifiedEmails: (...args: unknown[]) =>
        getUnclassifiedEmailsMock(...args),
    updateEmailClassification: (...args: unknown[]) =>
        updateEmailClassificationMock(...args),
    markEmailClassificationFailed: (...args: unknown[]) =>
        markEmailClassificationFailedMock(...args),
    markEmailIgnored: (...args: unknown[]) => markEmailIgnoredMock(...args),
    attributeEmailToCustomer: (...args: unknown[]) =>
        attributeEmailToCustomerMock(...args),
}));

const classifyEmailMock = vi.fn();

vi.mock("@/services/server/emailClassificationService", () => ({
    classifyEmail: (...args: unknown[]) => classifyEmailMock(...args),
}));

const matchPaymentEmailMock = vi.fn();

vi.mock("@/services/server/paymentEmailMatchingService", () => ({
    matchPaymentEmail: (...args: unknown[]) => matchPaymentEmailMock(...args),
}));

const persistPaymentDecisionMock = vi.fn();

vi.mock("@/services/server/paymentDecisionService", () => ({
    persistPaymentDecision: (...args: unknown[]) =>
        persistPaymentDecisionMock(...args),
}));

const logActivityMock = vi.fn();
const logInvoiceActivityMock = vi.fn();

vi.mock("@/services/server/activityLogService", () => ({
    logActivity: (...args: unknown[]) => logActivityMock(...args),
    logInvoiceActivity: (...args: unknown[]) => logInvoiceActivityMock(...args),
}));

const handleCollectionRelevantEmailMock = vi.fn();

vi.mock("@/services/server/collectionCaseOrchestrationService", () => ({
    handleCollectionRelevantEmail: (...args: unknown[]) =>
        handleCollectionRelevantEmailMock(...args),
}));

function baseEmail(overrides: Partial<Record<string, unknown>> = {}) {
    return {
        id: "email-1",
        subject: "Payment sent",
        text_body: "We already paid invoice INV-001.",
        from_email: "billing@acme.com",
        received_at: "2026-08-10T00:00:00.000Z",
        gmail_message_id: "gmail-msg-1",
        gmail_thread_id: "gmail-thread-1",
        ...overrides,
    };
}

describe("processUnclassifiedEmails — payment_received customer linkage", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        getUnclassifiedEmailsMock.mockReset();
        updateEmailClassificationMock.mockReset();
        markEmailClassificationFailedMock.mockReset();
        markEmailIgnoredMock.mockReset();
        attributeEmailToCustomerMock.mockReset();
        classifyEmailMock.mockReset();
        matchPaymentEmailMock.mockReset();
        persistPaymentDecisionMock.mockReset();
        logActivityMock.mockReset();
        logInvoiceActivityMock.mockReset();
        handleCollectionRelevantEmailMock.mockReset();

        updateEmailClassificationMock.mockResolvedValue(undefined);
        logActivityMock.mockResolvedValue(undefined);
        logInvoiceActivityMock.mockResolvedValue(undefined);
        persistPaymentDecisionMock.mockResolvedValue(undefined);
        attributeEmailToCustomerMock.mockResolvedValue(undefined);
    });

    it("attributes the email to the customer when the payment claim fully matches (status=ready)", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        getUnclassifiedEmailsMock.mockResolvedValueOnce([baseEmail()]);
        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_received",
            confidence: 0.97,
        });

        const matchResult: PaymentEmailMatchResult = {
            status: "ready",
            customerId: "cust-1",
            invoiceId: "inv-1",
            amount: 5000,
            currency: "INR",
            paymentDate: new Date("2026-08-09"),
            paymentMethod: "other",
            paymentReference: "REF123",
            invoiceNumber: "INV-001",
            confidence: 0.95,
        };
        matchPaymentEmailMock.mockResolvedValueOnce(matchResult);

        await processUnclassifiedEmails(10);

        expect(attributeEmailToCustomerMock).toHaveBeenCalledWith(
            "email-1",
            "cust-1"
        );
        expect(persistPaymentDecisionMock).toHaveBeenCalledWith(
            "email-1",
            matchResult
        );
    });

    it("still attributes the email when the claim needs review but a customer was resolved (e.g. amount/invoice missing)", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        getUnclassifiedEmailsMock.mockResolvedValueOnce([baseEmail()]);
        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_received",
            confidence: 0.8,
        });

        const matchResult: PaymentEmailMatchResult = {
            status: "needs_review",
            reason: "payment_facts_incomplete",
            normalizedFromEmail: "billing@acme.com",
            customerId: "cust-2",
            invoiceId: null,
            extracted: null,
        };
        matchPaymentEmailMock.mockResolvedValueOnce(matchResult);

        await processUnclassifiedEmails(10);

        expect(attributeEmailToCustomerMock).toHaveBeenCalledWith(
            "email-1",
            "cust-2"
        );
        expect(persistPaymentDecisionMock).toHaveBeenCalledWith(
            "email-1",
            matchResult
        );
    });

    it("does not attempt attribution when no customer could be resolved at all (customer_not_found)", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        getUnclassifiedEmailsMock.mockResolvedValueOnce([baseEmail()]);
        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_received",
            confidence: 0.8,
        });

        const matchResult: PaymentEmailMatchResult = {
            status: "needs_review",
            reason: "customer_not_found",
            normalizedFromEmail: "unknown@example.com",
            customerId: null,
            invoiceId: null,
            extracted: null,
        };
        matchPaymentEmailMock.mockResolvedValueOnce(matchResult);

        await processUnclassifiedEmails(10);

        expect(attributeEmailToCustomerMock).not.toHaveBeenCalled();
        expect(persistPaymentDecisionMock).toHaveBeenCalledWith(
            "email-1",
            matchResult
        );
    });

    it("never lets an attribution failure block persistPaymentDecision (isolation)", async () => {
        const { processUnclassifiedEmails } = await import(
            "./emailProcessingService"
        );

        getUnclassifiedEmailsMock.mockResolvedValueOnce([baseEmail()]);
        classifyEmailMock.mockResolvedValueOnce({
            classification: "payment_received",
            confidence: 0.95,
        });

        const matchResult: PaymentEmailMatchResult = {
            status: "ready",
            customerId: "cust-3",
            invoiceId: "inv-3",
            amount: 1000,
            currency: "INR",
            paymentDate: new Date("2026-08-09"),
            paymentMethod: "other",
            paymentReference: null,
            invoiceNumber: "INV-003",
            confidence: 0.95,
        };
        matchPaymentEmailMock.mockResolvedValueOnce(matchResult);
        attributeEmailToCustomerMock.mockRejectedValueOnce(
            new Error("db unavailable")
        );

        const result = await processUnclassifiedEmails(10);

        expect(attributeEmailToCustomerMock).toHaveBeenCalledWith(
            "email-1",
            "cust-3"
        );
        expect(persistPaymentDecisionMock).toHaveBeenCalledWith(
            "email-1",
            matchResult
        );
        // The email must still be reported as classified, not failed —
        // an attribution failure is a side effect, never the outcome.
        expect(result.classified).toBe(1);
        expect(result.failed).toBe(0);
    });
});
