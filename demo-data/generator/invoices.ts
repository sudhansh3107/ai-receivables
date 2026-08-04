import { DEMO_CONFIG } from "./config";
import { DemoClient, DemoInvoice } from "./types";

function generateInvoiceNumber(index: number): string {
  return `IBA-2026-${String(index + 1).padStart(4, "0")}`;
}

function randomDate(start: Date, end: Date): Date {
  const startTime = start.getTime();
  const endTime = end.getTime();

  return new Date(
    startTime + Math.random() * (endTime - startTime)
  );
}

function randomDateInMonth(
  year: number,
  month: number
): Date {
  const start = new Date(year, month, 1);

  const end = new Date(year, month + 1, 0);

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

function invoiceCountForClient(
  client: DemoClient
): number {
  switch (client.profile.category) {
    case "Corporate":
      return 9;

    case "University":
      return 7;

    case "College":
      return 5;

    case "Training Partner":
      return 4;

    case "Government":
      return 3;

    case "Startup":
      return 2;

    default:
      return 5;
  }
}

export function generateInvoices(
  clients: DemoClient[]
): DemoInvoice[] {
  const invoices: DemoInvoice[] = [];

  // Build a weighted client pool
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

  // Generate exactly TOTAL_INVOICES
  const monthlyDistribution = [
  { month: 4, count: DEMO_CONFIG.MAY_INVOICES },     // May
  { month: 5, count: DEMO_CONFIG.JUNE_INVOICES },    // June
  { month: 6, count: DEMO_CONFIG.JULY_INVOICES },    // July
  { month: 7, count: DEMO_CONFIG.AUGUST_INVOICES },  // August
];

for (const { month, count } of monthlyDistribution) {
  for (let i = 0; i < count; i++) {
    const client =
      clientPool[
        Math.floor(Math.random() * clientPool.length)
      ];

    const invoiceDate = randomDateInMonth(
      2026,
      month
    );

    const invoiceAmount = generateInvoiceAmount(
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

      currency: "INR",

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

      payment_terms: client.profile.paymentTerms,
    });
  }
}

  // Sort invoices chronologically
  invoices.sort(
    (a, b) =>
      a.invoice_date.getTime() -
      b.invoice_date.getTime()
  );

  // Assign sequential invoice numbers AFTER sorting
  invoices.forEach((invoice, index) => {
    invoice.invoice_number = generateInvoiceNumber(index);
  });

  return invoices;
}