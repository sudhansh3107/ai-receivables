import { generateClients } from "../generator/clients";
import { generateInvoices } from "../generator/invoices";

import { seedCustomers } from "./customers";
import { seedInvoices } from "./invoices";

import { generatePayments } from "../generator/payments";
import { seedPayments } from "./payments";

import { generateReminders } from "../generator/reminders";
import { seedReminders } from "./reminders";
import { seedActivities } from "./activities";
import { reconcileInvoices } from "./reconcileInvoices";
import { seedCustomerInsights } from "./customerInsights";

import { cleanupDatabase } from "./cleanup";

async function main() {
  console.clear();

  console.log("🚀 Orion Seeder");
  console.log("=========================\n");

  await cleanupDatabase();

  // Generate Demo Data
  const clients = generateClients();
  const invoices = generateInvoices(clients);

  console.log(`Generated ${clients.length} Customers`);
  console.log(`Generated ${invoices.length} Invoices\n`);

  // Seed Customers
  const customerIdMap = await seedCustomers(clients);

  // Seed Invoices
  const invoiceIdMap = await seedInvoices(
    invoices,
    customerIdMap
  );

  const payments = generatePayments(
  clients,
  invoices
);

await seedPayments(
  payments,
  customerIdMap,
  invoiceIdMap
);

await reconcileInvoices();

const reminders = generateReminders(
  invoices,
  payments
);

await seedReminders(
  reminders,
  customerIdMap,
  invoiceIdMap
);

await seedActivities(
  invoices,
  payments,
  reminders,
  customerIdMap,
  invoiceIdMap
);

await seedCustomerInsights(
  Array.from(customerIdMap.values())
);



  console.log("\n📊 Seed Summary");
console.log("======================");

  console.log(`Customers : ${customerIdMap.size}`);
  console.log(`Invoices  : ${invoiceIdMap.size}`);
  console.log(`Payments  : ${payments.length}`);
  console.log(`Reminders  : ${reminders.length}`);
  
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});