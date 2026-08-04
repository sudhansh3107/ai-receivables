import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DemoClient } from "../generator/types";

export async function seedCustomers(
  clients: DemoClient[]
) {
  const customerIdMap = new Map<string, string>();

  await supabaseAdmin
  .from("customers")
  .delete()
  .neq("id", "00000000-0000-0000-0000-000000000000");

  const rows = clients.map((client) => ({
    company_name: client.customer.company_name,
    contact_name: client.customer.contact_name,
    email: client.customer.email,
    phone: client.customer.phone,
    gst_number: client.customer.gst_number,
    status: client.customer.status,
    created_at: client.customer.created_at.toISOString(),
    updated_at: client.customer.updated_at.toISOString(),
    external_customer_id:
      client.customer.external_customer_id,
  }));

  const { data, error } = await supabaseAdmin
    .from("customers")
    .insert(rows)
    .select("id");

  if (error) {
    throw error;
  }

  data.forEach((row, index) => {
    customerIdMap.set(
      clients[index].customer.id,
      row.id
    );
  });

  console.log(
    `✅ Inserted ${data.length} customers`
  );

  return customerIdMap;
}