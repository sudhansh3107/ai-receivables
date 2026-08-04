import {
  DemoInvoice,
  DemoPayment,
  DemoReminder,
} from "./types";

const DEMO_END_DATE = new Date("2026-08-04T23:59:59");

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function generateReminders(
  invoices: DemoInvoice[],
  payments: DemoPayment[]
): DemoReminder[] {
  const reminders: DemoReminder[] = [];

  const paymentLookup = new Map(
    payments.map((payment) => [
      payment.invoice_id,
      payment,
    ])
  );

  for (const invoice of invoices) {
    const payment = paymentLookup.get(invoice.id);

    const stopDate = payment
      ? payment.payment_date
      : DEMO_END_DATE;

    const schedule = [
      addDays(invoice.due_date, -7),
      addDays(invoice.due_date, -1),
      addDays(invoice.due_date, 3),
      addDays(invoice.due_date, 7),
      addDays(invoice.due_date, 15),
    ];

    let stage = 1;

    for (const reminderDate of schedule) {
      if (reminderDate > stopDate) continue;

      reminders.push({
        id: crypto.randomUUID(),

        invoice_id: invoice.id,

        customer_id: invoice.customer_id,

        channel: "email",

        reminder_stage: stage++,

        scheduled_at: reminderDate,

        sent_at: reminderDate,

        delivery_status: "delivered",

        response_received: payment
          ? reminderDate >= payment.payment_date
          : false,
      });
    }

    // Continue reminders every 15 days until payment/demo end
    let nextReminder = addDays(
      invoice.due_date,
      30
    );

    while (nextReminder <= stopDate) {
      reminders.push({
        id: crypto.randomUUID(),

        invoice_id: invoice.id,

        customer_id: invoice.customer_id,

        channel: "email",

        reminder_stage: stage++,

        scheduled_at: nextReminder,

        sent_at: nextReminder,

        delivery_status: "delivered",

        response_received: payment
          ? nextReminder >= payment.payment_date
          : false,
      });

      nextReminder = addDays(nextReminder, 15);
    }
  }

  reminders.sort(
    (a, b) =>
      a.scheduled_at.getTime() -
      b.scheduled_at.getTime()
  );

  return reminders;
}