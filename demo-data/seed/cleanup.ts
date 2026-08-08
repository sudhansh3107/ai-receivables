import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { throwIfError } from "./utils";

export async function cleanupDatabase() {
  console.log("🧹 Cleaning existing demo data...\n");

  const tables = [
    "activity_log",
    "reminders",
    "payments",
    "invoice_files",
    "invoices",
    "upload_sessions",
    "customers",
    "employee_activity",
  ];

  for (const table of tables) {
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    throwIfError(error);

    console.log(`🗑️ Cleared ${table}`);
  }

  console.log("\n✅ Database cleanup complete.\n");
}