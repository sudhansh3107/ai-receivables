import { supabase } from "@/lib/supabase";
import { logInvoiceActivity } from "./activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";
import { ReminderStage, } from "@/lib/reminderStages";

export interface ScheduleReminderInput {
    invoiceId: string;
    customerId: string;

    reminderStage: number;

    scheduledAt: Date;

    channel?: "email" | "whatsapp";
}

export async function scheduleReminder(
    input: ScheduleReminderInput
) {
    const { data, error } = await supabase
        .from("reminders")
        .insert({
            invoice_id: input.invoiceId,
            customer_id: input.customerId,

            channel: input.channel ?? "email",

            reminder_stage: input.reminderStage,

            scheduled_at: input.scheduledAt.toISOString(),

            delivery_status: "pending",
        })
        .select()
        .single();

    if (error) throw error;

    await logInvoiceActivity(
        input.invoiceId,
        input.customerId,
        ActivityTypes.REMINDER_SCHEDULED,
        `Reminder ${input.reminderStage} scheduled`,
        {
            channel: input.channel ?? "email",
            reminderStage: input.reminderStage,
            scheduledAt: input.scheduledAt.toISOString(),
        }
    );

    return data;
}