import { DemoClient, DemoInvoice, DemoPayment } from "./types";

const PAYMENT_METHODS = [
  "bank_transfer",
  "upi",
  "cheque",
  "credit_card",
  "debit_card",
] as const;

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function paymentReference(index: number): string {
  return `PAY-${new Date().getFullYear()}-${String(
    index + 1
  ).padStart(6, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function generatePayments(
  clients: DemoClient[],
  invoices: DemoInvoice[]
): DemoPayment[] {
  const payments: DemoPayment[] = [];

  // Customer ID -> Client lookup
  const clientLookup = new Map<string, DemoClient>(
    clients.map((client) => [
      client.customer.id,
      client,
    ])
  );

  const orderedInvoices = [...invoices].sort(
    (a, b) =>
      a.invoice_date.getTime() -
      b.invoice_date.getTime()
  );

  let paymentIndex = 0;

  for (const invoice of orderedInvoices) {
    const client = clientLookup.get(invoice.customer_id);

    if (!client) continue;

    const profile = client.profile.paymentProfile;

    let outcome: "paid" | "partial" | "overdue";

   switch (profile) {
  case "Premium": {
    const r = Math.random();

    if (r < 0.92) outcome = "paid";
    else if (r < 0.98) outcome = "partial";
    else outcome = "overdue";
    break;
  }

  case "Reliable": {
    const r = Math.random();

    if (r < 0.82) outcome = "paid";
    else if (r < 0.94) outcome = "partial";
    else outcome = "overdue";
    break;
  }

  case "Enterprise": {
    const r = Math.random();

    if (r < 0.85) outcome = "paid";
    else if (r < 0.95) outcome = "partial";
    else outcome = "overdue";
    break;
  }

  case "Delayed": {
    const r = Math.random();

    if (r < 0.60) outcome = "paid";
    else if (r < 0.80) outcome = "partial";
    else outcome = "overdue";
    break;
  }

  case "Slow": {
    const r = Math.random();

    if (r < 0.40) outcome = "paid";
    else if (r < 0.60) outcome = "partial";
    else outcome = "overdue";
    break;
  }

  case "High Risk": {
    const r = Math.random();

    if (r < 0.15) outcome = "paid";
    else if (r < 0.35) outcome = "partial";
    else outcome = "overdue";
    break;
  }

  default:
    outcome = "paid";
}

    if (outcome === "overdue") {
      invoice.status = "overdue";
      invoice.balance_due =
        invoice.invoice_amount;
      continue;
    }

    let paymentDate = new Date(invoice.due_date);

switch (profile) {
  case "Premium":
    paymentDate = addDays(
      invoice.due_date,
      -randomBetween(3, 7)
    );
    break;

  case "Reliable":
    paymentDate = addDays(
      invoice.due_date,
      randomBetween(-2, 2)
    );
    break;

  case "Enterprise":
    paymentDate = new Date(invoice.due_date);
    break;

  case "Delayed":
    paymentDate = addDays(
      invoice.due_date,
      randomBetween(8, 15)
    );
    break;

  case "Slow":
    paymentDate = addDays(
      invoice.due_date,
      randomBetween(15, 25)
    );
    break;

  case "High Risk":
    paymentDate = addDays(
      invoice.due_date,
      randomBetween(20, 35)
    );
    break;
}

    const paymentAmount =
      outcome === "paid"
        ? invoice.invoice_amount
        : Math.round(
            invoice.invoice_amount *
              (0.6 + Math.random() * 0.3)
          );

    payments.push({
      invoice_id: invoice.id,

      customer_id: invoice.customer_id,

      amount: paymentAmount,

      payment_date: paymentDate,

      payment_method:
        PAYMENT_METHODS[
          Math.floor(
            Math.random() *
              PAYMENT_METHODS.length
          )
        ],

      payment_reference:
        paymentReference(paymentIndex++),

      notes:
        outcome === "partial"
          ? "Partial payment received."
          : null,
    });

    if (outcome === "paid") {
      invoice.status = "paid";
      invoice.balance_due = 0;
    } else {
      invoice.status = "partial";
      invoice.balance_due =
        invoice.invoice_amount -
        paymentAmount;
    }
  }

  return payments;
}