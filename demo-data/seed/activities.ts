import { supabaseAdmin } from "../../lib/supabaseAdmin";
import {
  DemoInvoice,
  DemoPayment,
  DemoReminder,
} from "../generator/types";
import { throwIfError } from "./utils";

type ActivityRow = {
  invoice_id: string;
  customer_id: string;
  activity_type:
    | "invoice_created"
    | "reminder_scheduled"
    | "reminder_sent"
    | "payment_recorded"
    | "invoice_paid"
    | "invoice_partially_paid"
    | "invoice_overdue";

  description: string;

  metadata: Record<string, unknown> | null;

  created_at: string;
};

export async function seedActivities(
  invoices: DemoInvoice[],
  payments: DemoPayment[],
  reminders: DemoReminder[],
  customerIdMap: Map<string, string>,
  invoiceIdMap: Map<string, string>
) {
  const rows: ActivityRow[] = [];

  const paymentLookup = new Map(
    payments.map((p) => [p.invoice_id, p])
  );

  /*
   * Invoice Created
   */
  for (const invoice of invoices) {
    rows.push({
      invoice_id: invoiceIdMap.get(invoice.id)!,
      customer_id: customerIdMap.get(invoice.customer_id)!,

      activity_type: "invoice_created",

      description: `Invoice ${invoice.invoice_number} created.`,

      metadata: {
        invoice_number: invoice.invoice_number,
        amount: invoice.invoice_amount,
      },

      created_at: invoice.invoice_date.toISOString(),
    });
  }

  /*
   * Reminder Events
   */
  for (const reminder of reminders) {
    rows.push({
      invoice_id: invoiceIdMap.get(reminder.invoice_id)!,
      customer_id: customerIdMap.get(reminder.customer_id)!,

      activity_type: "reminder_scheduled",

      description: `Reminder ${reminder.reminder_stage} scheduled.`,

      metadata: {
        stage: reminder.reminder_stage,
        channel: reminder.channel,
      },

      created_at: reminder.scheduled_at.toISOString(),
    });

    rows.push({
      invoice_id: invoiceIdMap.get(reminder.invoice_id)!,
      customer_id: customerIdMap.get(reminder.customer_id)!,

      activity_type: "reminder_sent",

      description: `Reminder ${reminder.reminder_stage} sent via ${reminder.channel}.`,

      metadata: {
        stage: reminder.reminder_stage,
        channel: reminder.channel,
      },

      created_at: (
        reminder.sent_at ?? reminder.scheduled_at
      ).toISOString(),
    });
  }

  /*
   * Payment Events
   */
  for (const payment of payments) {
    const invoice = invoices.find(
      (i) => i.id === payment.invoice_id
    );

    if (!invoice) continue;

    rows.push({
      invoice_id: invoiceIdMap.get(invoice.id)!,
      customer_id: customerIdMap.get(invoice.customer_id)!,

      activity_type: "payment_recorded",

      description: `Payment of ₹${payment.amount.toLocaleString()} received.`,

      metadata: {
        amount: payment.amount,
        method: payment.payment_method,
      },

      created_at: payment.payment_date.toISOString(),
    });

    rows.push({
      invoice_id: invoiceIdMap.get(invoice.id)!,
      customer_id: customerIdMap.get(invoice.customer_id)!,

      activity_type:
        invoice.status === "paid"
          ? "invoice_paid"
          : "invoice_partially_paid",

      description:
        invoice.status === "paid"
          ? "Invoice marked as paid."
          : "Invoice marked as partially paid.",

      metadata: null,

      created_at: payment.payment_date.toISOString(),
    });
  }

  /*
   * Overdue Events
   */
  for (const invoice of invoices) {
    if (invoice.status !== "overdue") continue;

    const overdueDate = new Date(invoice.due_date);

    overdueDate.setDate(
      overdueDate.getDate() + 1
    );

    rows.push({
      invoice_id: invoiceIdMap.get(invoice.id)!,
      customer_id: customerIdMap.get(invoice.customer_id)!,

      activity_type: "invoice_overdue",

      description: "Invoice became overdue.",

      metadata: null,

      created_at: overdueDate.toISOString(),
    });
  }

  rows.sort(
    (a, b) =>
      new Date(a.created_at).getTime() -
      new Date(b.created_at).getTime()
  );

  const { data, error } = await supabaseAdmin
    .from("activity_log")
    .insert(rows)
    .select("id");

  throwIfError(error);

  console.log(
    `✅ Inserted ${data?.length ?? 0} activities`
  );
}