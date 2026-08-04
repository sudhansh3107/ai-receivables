import {
  DemoActivity,
  DemoInvoice,
  DemoPayment,
  DemoReminder,
} from "./types";

export function generateActivities(
  invoices: DemoInvoice[],
  payments: DemoPayment[],
  reminders: DemoReminder[]
): DemoActivity[] {
  const activities: DemoActivity[] = [];

  // Invoice Created
  for (const invoice of invoices) {
    activities.push({
      id: crypto.randomUUID(),

      customer_id: invoice.customer_id,

      invoice_id: invoice.id,

      activity_type: "invoice_created",

      title: "Invoice Created",

      description: `${invoice.invoice_number} worth ₹${invoice.invoice_amount.toLocaleString()} was created.`,

      activity_date: invoice.invoice_date,
    });
  }

  // Reminder Sent
  for (const reminder of reminders) {
    activities.push({
      id: crypto.randomUUID(),

      customer_id: reminder.customer_id,

      invoice_id: reminder.invoice_id,

      activity_type: "reminder_sent",

      title: `Reminder ${reminder.reminder_stage} Sent`,

      description: `Reminder ${reminder.reminder_stage} sent via ${reminder.channel}.`,

      activity_date: reminder.sent_at ?? reminder.scheduled_at,
    });
  }

  // Payment Received
  for (const payment of payments) {
    activities.push({
      id: crypto.randomUUID(),

      customer_id: payment.customer_id,

      invoice_id: payment.invoice_id,

      activity_type: "payment_received",

      title: "Payment Received",

      description: `Payment of ₹${payment.amount.toLocaleString()} received via ${payment.payment_method}.`,

      activity_date: payment.payment_date,
    });
  }

  // Sort everything by date
  activities.sort(
    (a, b) =>
      a.activity_date.getTime() -
      b.activity_date.getTime()
  );

  return activities;
}