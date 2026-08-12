import { refreshCustomerInsights } from "@/services/server/customerInsightService";

// Runs after invoices/payments/reminders/activities are seeded and
// invoice balances are reconciled, so calculateCustomerInsights()
// reads final, correct data. Sequential + per-customer try/catch
// (not throwIfError) because this fans out into one OpenAI call per
// customer — one transient failure shouldn't abort a demo seed that
// already inserted everything else.
export async function seedCustomerInsights(
  customerIds: string[]
) {
  let succeeded = 0;
  let failed = 0;

  for (const customerId of customerIds) {
    try {
      await refreshCustomerInsights(customerId);
      succeeded++;
    } catch (error) {
      failed++;
      console.error(`❌ Customer insights failed for ${customerId}`);
      console.error(error);
    }
  }

  console.log(
    `✅ Generated customer insights for ${succeeded} customers` +
      (failed > 0 ? ` (${failed} failed)` : "")
  );
}
