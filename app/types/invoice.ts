export type Invoice = {
  id: string;

  customer_id: string;

  upload_session_id: string | null;

  invoice_number: string;

  invoice_date: string;

  due_date: string;

  currency: "INR" | "USD" | "EUR" | "AED" | "GBP";

  invoice_amount: number;

  balance_due: number;

  status:
    | "pending"
    | "partial"
    | "paid"
    | "overdue"
    | "cancelled";

  source_type:
    | "upload"
    | "email"
    | "erp"
    | "manual"
    | "api";

  payment_terms: number | null;

  invoice_confidence_score: number | null;

  invoice_confidence_level:
    | "low"
    | "medium"
    | "high"
    | null;

  invoice_confidence_reasons:
    | Record<string, unknown>
    | null;

  created_at: string;

  updated_at: string;

  customers: {
    company_name: string;
  } | null;
};