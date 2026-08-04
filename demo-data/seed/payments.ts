import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { DemoPayment } from "../generator/types";
import { throwIfError } from "./utils";

export async function seedPayments(
  payments: DemoPayment[],
  customerIdMap: Map<string, string>,
  invoiceIdMap: Map<string, string>
) {
  const rows = payments.map((payment) => ({
    invoice_id: invoiceIdMap.get(payment.invoice_id)!,

    customer_id: customerIdMap.get(payment.customer_id)!,

    amount: payment.amount,

    payment_date: payment.payment_date
      .toISOString()
      .split("T")[0],

    payment_method: payment.payment_method,

    payment_reference: payment.payment_reference,

    notes: payment.notes,
  }));

  const { data, error } = await supabaseAdmin
    .from("payments")
    .insert(rows)
    .select("id");

  throwIfError(error);

  console.log(
    `✅ Inserted ${data?.length ?? 0} payments`
  );
}