export const EmailClassifications = {
    PAYMENT_RECEIVED: "payment_received",
    PAYMENT_PROMISE: "payment_promise",
    INVOICE_RELATED: "invoice_related",
    DISPUTE: "dispute",
    // Responsibility #3 (Collections & Follow-Up) — administrative /
    // process blocker (PO, approval, documentation, vendor onboarding,
    // tax/compliance): the customer intends to pay but is internally
    // stuck. Distinct from DISPUTE, which is adversarial (contesting the
    // debt itself). This is the ONLY blocker-detection mechanism — no
    // fallback/keyword/secondary detector exists or should be added.
    PAYMENT_BLOCKER: "payment_blocker",
    REMINDER_RESPONSE: "reminder_response",
    CUSTOMER_INQUIRY: "customer_inquiry",
    IRRELEVANT: "irrelevant",
    OTHER: "other",
} as const;

export type EmailClassification =
    (typeof EmailClassifications)[keyof typeof EmailClassifications];

export const EMAIL_CLASSIFICATION_VALUES = Object.values(
    EmailClassifications
) as EmailClassification[];
