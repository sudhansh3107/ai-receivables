import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { throwIfError } from "./utils";

export async function cleanupDatabase() {
  console.log("🧹 Cleaning existing demo data...\n");

  const tables = [
    "payment_decisions",
    // Depends on invoice_files / upload_sessions
    "employee_activity",

    // Depends on invoices / customers
    "activity_log",
    "reminders",
    "payments",

    // Depends on invoices / upload_sessions
    "invoice_files",

    // Depends on customers
    "customer_insights",

    // Depends on upload_sessions / customers
    "invoices",

    // Parent of invoices / invoice_files
    "upload_sessions",

    // Parent table
    "customers",
  ];

  for (const table of tables) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .neq(
        "id",
        "00000000-0000-0000-0000-000000000000"
      );

    throwIfError(error);

    console.log(`🗑️ Cleared ${table}`);
  }

  console.log("\n✅ Database cleanup complete.\n");
}