export interface DemoCustomer {
  id: string;

  company_name: string;

  contact_name: string | null;

  email: string | null;

  phone: string | null;

  gst_number: string | null;

  status: "active" | "inactive" | "blocked";

  created_at: Date;

  updated_at: Date;

  external_customer_id: string | null;
}

export interface ClientTemplate {
  companyName: string;

  category:
    | "College"
    | "University"
    | "Corporate"
    | "Training Partner"
    | "Government"
    | "Startup";

  city: string;

  contactName: string;

  email: string;

  phone: string;

  gstNumber: string;

  paymentProfile:
    | "Premium"
    | "Reliable"
    | "Delayed"
    | "Slow"
    | "Enterprise"
    | "High Risk";

  paymentTerms: number;

  averageInvoice: number;

  trustScore: number;
}

export interface DemoClient {
  customer: DemoCustomer;

  profile: ClientTemplate;
}

export interface DemoInvoice {
  id: string;

  customer_id: string;

  upload_session_id: string | null;

  invoice_number: string;

  invoice_date: Date;

  due_date: Date;

  currency: "INR";

  invoice_amount: number;

  balance_due: number;

  status:
    | "pending"
    | "partial"
    | "paid"
    | "overdue"
    | "cancelled";

  source_type: "upload";

  invoice_confidence_score: number;

  invoice_confidence_level:
    | "low"
    | "medium"
    | "high";

  invoice_confidence_reasons: string[];

  payment_terms: number;
}

export interface DemoPayment {
  invoice_id: string;

  customer_id: string;

  amount: number;

  payment_date: Date;

  payment_method:
    | "bank_transfer"
    | "upi"
    | "cheque"
    | "cash"
    | "credit_card"
    | "debit_card"
    | "other";

  payment_reference: string | null;

  notes: string | null;
}

export interface DemoReminder {
  id: string;

  invoice_id: string;

  customer_id: string;

  channel:
    | "email"
    | "sms"
    | "whatsapp"
    | "phone";

  reminder_stage: number;

  scheduled_at: Date;

  sent_at: Date | null;

  delivery_status:
    | "pending"
    | "queued"
    | "sent"
    | "delivered"
    | "failed"
    | "cancelled";

  response_received: boolean;
}

export interface DemoActivity {
  id: string;

  customer_id: string;

  invoice_id: string | null;

  activity_type:
    | "invoice_created"
    | "reminder_sent"
    | "payment_received";

  title: string;

  description: string;

  activity_date: Date;
}