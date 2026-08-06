import { DEMO_CONFIG } from "./config";
import { DemoClient, DemoInvoice } from "./types";

function generateInvoiceNumber(index: number): string {
  return `IBA-${new Date().getFullYear()}-${String(index + 1).padStart(4, "0")}`;
}

function randomDate(start: Date, end: Date): Date {
  const startTime = start.getTime();
  const endTime = end.getTime();

  return new Date(
    startTime + Math.random() * (endTime - startTime)
  );
}

function randomDateInMonth(
  monthOffset: number
): Date {
  const start = new Date(DEMO_CONFIG.START_DATE);

  start.setMonth(start.getMonth() + monthOffset);
  start.setDate(1);

  const end = new Date(start);

  end.setMonth(end.getMonth() + 1);
  end.setDate(0);

  const today = new Date(DEMO_CONFIG.END_DATE);

  // If this is the current month,
  // only generate invoices up to today.
  if (
    start.getFullYear() === today.getFullYear() &&
    start.getMonth() === today.getMonth()
  ) {
    return randomDate(start, today);
  }

  return randomDate(start, end);
}

function calculateDueDate(
  invoiceDate: Date,
  paymentTerms: number
): Date {
  const dueDate = new Date(invoiceDate);

  dueDate.setDate(
    dueDate.getDate() + paymentTerms
  );

  return dueDate;
}

function generateInvoiceAmount(
  average: number
): number {
  const variation = average * 0.15;

  const min = average - variation;
  const max = average + variation;

  return Math.round(
    Math.random() * (max - min) + min
  );
}

export function generateInvoices(
  clients: DemoClient[]
): DemoInvoice[] {
  const invoices: DemoInvoice[] = [];

  // Build weighted client pool
  const clientPool: DemoClient[] = [];

  for (const client of clients) {
    let weight = 1;

    switch (client.profile.category) {
      case "Corporate":
        weight = 5;
        break;

      case "University":
        weight = 4;
        break;

      case "College":
        weight = 3;
        break;

      case "Training Partner":
        weight = 2;
        break;

      case "Government":
        weight = 2;
        break;

      case "Startup":
        weight = 1;
        break;
    }

    for (let i = 0; i < weight; i++) {
      clientPool.push(client);
    }
  }

  const monthlyDistribution =
    DEMO_CONFIG.MONTHLY_DISTRIBUTION.map(
      (count, monthOffset) => ({
        monthOffset,
        count,
      })
    );

  for (const {
    monthOffset,
    count,
  } of monthlyDistribution) {
    for (let i = 0; i < count; i++) {
      const client =
        clientPool[
          Math.floor(
            Math.random() *
              clientPool.length
          )
        ];

      const invoiceDate =
        randomDateInMonth(monthOffset);

      const invoiceAmount =
        generateInvoiceAmount(
          client.profile.averageInvoice
        );

      invoices.push({
        id: crypto.randomUUID(),

        customer_id: client.customer.id,

        upload_session_id: null,

        invoice_number: "",

        invoice_date: invoiceDate,

        due_date: calculateDueDate(
          invoiceDate,
          client.profile.paymentTerms
        ),

        currency: DEMO_CONFIG.CURRENCY,

        invoice_amount: invoiceAmount,

        balance_due: invoiceAmount,

        status: "pending",

        source_type: "upload",

        invoice_confidence_score: 98.5,

        invoice_confidence_level: "high",

        invoice_confidence_reasons: [
          "High OCR confidence",
          "Business rules validated",
          "Vendor matched successfully",
        ],

        payment_terms:
          client.profile.paymentTerms,
      });
    }
  }

  // Sort chronologically
  invoices.sort(
    (a, b) =>
      a.invoice_date.getTime() -
      b.invoice_date.getTime()
  );

  // Assign invoice numbers
  invoices.forEach((invoice, index) => {
    invoice.invoice_number =
      generateInvoiceNumber(index);
  });

  return invoices;
}
