import { generateClients } from "./clients";
import { generateInvoices } from "./invoices";
import { generatePayments } from "./payments";
import { generateReminders } from "./reminders";
import { generateActivities } from "./activities";

function main() {
  console.clear();

  console.log("🚀 Orion Demo Company Generator");
  console.log("==========================================\n");

  // Generate Customers
  const clients = generateClients();

  console.log(`✅ Generated ${clients.length} Customers\n`);

  // Generate Invoices
  const invoices = generateInvoices(clients);

  console.log(`✅ Generated ${invoices.length} Invoices\n`);

  // Generate Payments (This also updates invoice status)
  const payments = generatePayments(clients, invoices);

  console.log(`✅ Generated ${payments.length} Payments\n`);

  // Sample Invoices
  console.log("📄 Sample Invoices\n");

  console.table(
    invoices.slice(0, 10).map((invoice) => ({
      Invoice: invoice.invoice_number,
      Customer: invoice.customer_id.slice(0, 8),
      Amount: `₹${invoice.invoice_amount.toLocaleString()}`,
      Balance: `₹${invoice.balance_due.toLocaleString()}`,
      Status: invoice.status,
      Date: invoice.invoice_date.toLocaleDateString(),
      Due: invoice.due_date.toLocaleDateString(),
    }))
  );

  // Monthly Invoice Distribution
  const monthlySummary = invoices.reduce(
    (acc, invoice) => {
      const month = invoice.invoice_date.toLocaleString("en-US", {
        month: "long",
      });

      acc[month] = (acc[month] ?? 0) + 1;

      return acc;
    },
    {} as Record<string, number>
  );

  console.log("\n📊 Invoice Distribution\n");

  console.table(monthlySummary);

  // Invoice Status Summary
  console.log("\n📈 Invoice Status Summary\n");

  console.table({
    Paid: invoices.filter((i) => i.status === "paid").length,
    Partial: invoices.filter((i) => i.status === "partial").length,
    Overdue: invoices.filter((i) => i.status === "overdue").length,
  });

  // Sample Payments
  console.log("\n💰 Sample Payments\n");

  console.table(
    payments.slice(0, 10).map((payment) => ({
      Invoice: payment.invoice_id.slice(0, 8),
      Customer: payment.customer_id.slice(0, 8),
      Amount: `₹${payment.amount.toLocaleString()}`,
      Method: payment.payment_method,
      Date: payment.payment_date.toLocaleDateString(),
      Reference: payment.payment_reference,
    }))
  );

  const reminders = generateReminders(
  invoices,
  payments
);

console.log(
  `✅ Generated ${reminders.length} Reminders\n`
);

console.table(
  reminders.slice(0, 10).map((r) => ({
    Invoice: r.invoice_id.slice(0, 8),
    Stage: r.reminder_stage,
    Date: r.scheduled_at.toLocaleDateString(),
    Channel: r.channel,
    Status: r.delivery_status,
  }))
);

const activities = generateActivities(
  invoices,
  payments,
  reminders
);

console.log(
  `✅ Generated ${activities.length} Activities\n`
);

console.table(
  activities.slice(0, 20).map((activity) => ({
    Date: activity.activity_date.toLocaleDateString(),
    Type: activity.activity_type,
    Title: activity.title,
    Customer: activity.customer_id.slice(0, 8),
  }))
);

  console.log("\n🎉 Orion Demo Company generated successfully!");
}

main();