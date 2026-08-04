import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { DemoReminder } from "../generator/types";
import { throwIfError } from "./utils";

export async function seedReminders(
  reminders: DemoReminder[],
  customerIdMap: Map<string, string>,
  invoiceIdMap: Map<string, string>
) {
  const rows = reminders.map((reminder) => ({
    invoice_id: invoiceIdMap.get(reminder.invoice_id)!,

    customer_id: customerIdMap.get(reminder.customer_id)!,

    channel: reminder.channel,

    reminder_stage: reminder.reminder_stage,

    scheduled_at: reminder.scheduled_at.toISOString(),

    sent_at: reminder.sent_at
      ? reminder.sent_at.toISOString()
      : null,

    delivery_status: reminder.delivery_status,

    response_received: reminder.response_received,
  }));

  const { data, error } = await supabaseAdmin
    .from("reminders")
    .insert(rows)
    .select("id");

  throwIfError(error);

  console.log(
    `✅ Inserted ${data?.length ?? 0} reminders`
  );
}