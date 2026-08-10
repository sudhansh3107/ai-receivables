export const EmailClassifications = {
    PAYMENT_RECEIVED: "payment_received",
    PAYMENT_PROMISE: "payment_promise",
    INVOICE_RELATED: "invoice_related",
    DISPUTE: "dispute",
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
