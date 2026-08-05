import type { Invoice } from "@/app/types/invoice";

export interface DashboardStats {
  briefing: {
    employee: string;
    totalInvoices: number;
    outstandingBalance: number;
    overdueInvoices: number;
  };

  kpis: {
    outstandingBalance: number;
    totalInvoices: number;
    overdueInvoices: number;
    paidInvoices: number;
    pendingInvoices: number;
    partialInvoices: number;
    averageConfidence: number;
    uniqueCustomers: number;
  };

  health: {
    collections: "Healthy" | "Warning" | "Critical";
    overdueRisk: "Low" | "Medium" | "High";
    aiConfidence: "High" | "Medium" | "Low";
  };
}

export function buildDashboardStats(
  invoices: Invoice[]
): DashboardStats {
  const totalInvoices = invoices.length;

  const outstandingBalance = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.balance_due),
    0
  );

  const overdueInvoices = invoices.filter(
    (invoice) => invoice.status === "overdue"
  ).length;

  const paidInvoices = invoices.filter(
    (invoice) => invoice.status === "paid"
  ).length;

  const pendingInvoices = invoices.filter(
    (invoice) => invoice.status === "pending"
  ).length;

  const partialInvoices = invoices.filter(
    (invoice) => invoice.status === "partial"
  ).length;

  const confidenceScores = invoices
    .map((invoice) => invoice.invoice_confidence_score)
    .filter(
      (score): score is number =>
        score !== null && score !== undefined
    );

  const averageConfidence =
    confidenceScores.length === 0
      ? 0
      : Math.round(
          confidenceScores.reduce((a, b) => a + Number(b), 0) /
            confidenceScores.length
        );

  const uniqueCustomers = new Set(
    invoices
      .map((invoice) => invoice.customers?.company_name)
      .filter(Boolean)
  ).size;

  let collections: DashboardStats["health"]["collections"] =
    "Healthy";

  if (overdueInvoices >= 10) {
    collections = "Critical";
  } else if (overdueInvoices >= 5) {
    collections = "Warning";
  }

  let overdueRisk: DashboardStats["health"]["overdueRisk"] =
    "Low";

  if (overdueInvoices >= 10) {
    overdueRisk = "High";
  } else if (overdueInvoices >= 5) {
    overdueRisk = "Medium";
  }

  let aiConfidence: DashboardStats["health"]["aiConfidence"] =
    "High";

  if (averageConfidence < 70) {
    aiConfidence = "Low";
  } else if (averageConfidence < 90) {
    aiConfidence = "Medium";
  }

  return {
    briefing: {
      employee: "Orion",
      totalInvoices,
      outstandingBalance,
      overdueInvoices,
    },

    kpis: {
      outstandingBalance,
      totalInvoices,
      overdueInvoices,
      paidInvoices,
      pendingInvoices,
      partialInvoices,
      averageConfidence,
      uniqueCustomers,
    },

    health: {
      collections,
      overdueRisk,
      aiConfidence,
    },
  };
}