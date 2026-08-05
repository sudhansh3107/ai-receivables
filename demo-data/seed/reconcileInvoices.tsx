import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function reconcileInvoices() {
  const { data: invoices, error } = await supabaseAdmin
    .from("invoices")
    .select(`
      id,
      invoice_amount,
      due_date,
      payments(amount)
    `);

  if (error) throw error;

  let updated = 0;

  for (const invoice of invoices ?? []) {
    const totalPaid =
      invoice.payments?.reduce(
        (sum: number, payment: { amount: number }) =>
          sum + Number(payment.amount),
        0
      ) ?? 0;

    const invoiceAmount = Number(invoice.invoice_amount);
    const balanceDue = Math.max(0, invoiceAmount - totalPaid);

    let status:
      | "pending"
      | "partial"
      | "paid"
      | "overdue";

    if (balanceDue === 0) {
      status = "paid";
    } else if (balanceDue < invoiceAmount) {
      status = "partial";
    } else {
      const today = new Date();
      const dueDate = new Date(invoice.due_date);

      status =
        dueDate < today ? "overdue" : "pending";
    }

    const { error: updateError } = await supabaseAdmin
      .from("invoices")
      .update({
        balance_due: balanceDue,
        status,
      })
      .eq("id", invoice.id);

    if (updateError) throw updateError;

    updated++;
  }

  console.log(`✅ Reconciled ${updated} invoices`);
}