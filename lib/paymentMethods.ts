export const PaymentMethod = {
    BANK_TRANSFER: "bank_transfer",
    UPI: "upi",
    CASH: "cash",
    CHEQUE: "cheque",
    CREDIT_CARD: "credit_card",
    DEBIT_CARD: "debit_card",
    OTHER: "other",
} as const;

export type PaymentMethodType=
    (typeof PaymentMethod)[keyof typeof PaymentMethod];