import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { DemoInvoice } from "../generator/types";
import { throwIfError } from "./utils";

export async function seedInvoices(
  invoices: DemoInvoice[],
  customerIdMap: Map<string, string>
) {
  const invoiceIdMap = new Map<string, string>();

  const rows = invoices.map((invoice) => ({
    customer_id: customerIdMap.get(invoice.customer_id)!,

    upload_session_id: null,

    invoice_number: invoice.invoice_number,

    invoice_date: invoice.invoice_date
      .toISOString()
      .split("T")[0],

    due_date: invoice.due_date
      .toISOString()
      .split("T")[0],

    currency: invoice.currency,

    invoice_amount: invoice.invoice_amount,

    balance_due: invoice.balance_due,

    status: invoice.status,

    source_type: invoice.source_type,

    invoice_confidence_score:
      invoice.invoice_confidence_score,

    invoice_confidence_level:
      invoice.invoice_confidence_level,

    invoice_confidence_reasons:
      invoice.invoice_confidence_reasons,

    payment_terms: invoice.payment_terms,
  }));

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .insert(rows)
    .select("id");

  throwIfError(error);

 if (!data) {
  throw new Error("No invoices were returned after insert.");
}

data.forEach((row, index) => {
  invoiceIdMap.set(
    invoices[index].id,
    row.id
  );
});

  console.log(
    `✅ Inserted ${data.length} invoices`
  );

  return invoiceIdMap;
}