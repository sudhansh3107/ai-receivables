import { DEMO_CONFIG } from "./config";
import {
  DemoInvoice,
  DemoPayment,
  DemoReminder,
} from "./types";

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Simulated delivery lag between a reminder being scheduled and being
// sent, so the two Activity events don't land on an identical instant.
const DELIVERY_DELAY_HOURS = 3;

// Guarantees scheduled_at < sent_at <= stopDate whenever there is any
// headroom between the two. When a reminder is scheduled exactly at
// stopDate (zero headroom), there is no valid instant that is both
// later than scheduled_at and no later than stopDate, so the reminder
// is represented as not yet delivered instead.
function computeDelivery(
  scheduledAt: Date,
  stopDate: Date
): {
  sentAt: Date | null;
  deliveryStatus: "delivered" | "pending";
} {
  const headroomMs = stopDate.getTime() - scheduledAt.getTime();

  if (headroomMs <= 0) {
    return { sentAt: null, deliveryStatus: "pending" };
  }

  const delayMs = Math.min(
    DELIVERY_DELAY_HOURS * 60 * 60 * 1000,
    headroomMs
  );

  return {
    sentAt: new Date(scheduledAt.getTime() + delayMs),
    deliveryStatus: "delivered",
  };
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
      : DEMO_CONFIG.END_DATE;

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

      const { sentAt, deliveryStatus } = computeDelivery(
        reminderDate,
        stopDate
      );

      reminders.push({
        id: crypto.randomUUID(),

        invoice_id: invoice.id,

        customer_id: invoice.customer_id,

        channel: "email",

        reminder_stage: stage++,

        scheduled_at: reminderDate,

        sent_at: sentAt,

        delivery_status: deliveryStatus,

        response_received:
          payment != null &&
          reminderDate >= payment.payment_date,
      });
    }

    // Continue reminders every 15 days
    // until payment or demo end.
    let nextReminder = addDays(
      invoice.due_date,
      30
    );

    while (nextReminder <= stopDate) {
      const { sentAt, deliveryStatus } = computeDelivery(
        nextReminder,
        stopDate
      );

      reminders.push({
        id: crypto.randomUUID(),

        invoice_id: invoice.id,

        customer_id: invoice.customer_id,

        channel: "email",

        reminder_stage: stage++,

        scheduled_at: nextReminder,

        sent_at: sentAt,

        delivery_status: deliveryStatus,

        response_received:
          payment != null &&
          nextReminder >= payment.payment_date,
      });

      nextReminder = addDays(
        nextReminder,
        15
      );
    }
  }

  reminders.sort(
    (a, b) =>
      a.scheduled_at.getTime() -
      b.scheduled_at.getTime()
  );

  return reminders;
}