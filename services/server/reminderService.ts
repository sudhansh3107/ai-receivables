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

export interface NextReminder {
    reminderStage: number;
    scheduledAt: string;
    channel: string;
}

// "Needing attention" = not yet actioned by a human, due or overdue,
// AND still relevant — a reminder whose invoice has already been
// paid is obsolete (the business outcome resolved it), so it's
// excluded here even though nobody explicitly actioned it. This
// exclusion is why the query joins invoices with `!inner`: without
// it, an already-paid invoice's reminder would count as "remaining"
// forever.
export async function getRemindersNeedingAttentionCount(): Promise<number> {
    const nowIso = new Date().toISOString();

    const { count, error } = await supabase
        .from("reminders")
        .select("*, invoices!inner(status)", {
            head: true,
            count: "exact",
        })
        .eq("delivery_status", "pending")
        .is("actioned_at", null)
        .lte("scheduled_at", nowIso)
        .neq("invoices.status", "paid");

    if (error) throw error;

    return count ?? 0;
}

export interface ReminderNeedingAttention {
    id: string;
    customerId: string;
    customerName: string;
    invoiceNumber: string;
    balanceDue: number;
    reminderStage: number;
    channel: string;
    scheduledAt: string;
}

interface ReminderNeedingAttentionRow {
    id: string;
    customer_id: string;
    reminder_stage: number;
    channel: string;
    scheduled_at: string;
    customers: { company_name: string } | null;
    invoices: { invoice_number: string; status: string; balance_due: number } | null;
}

// Pass no `limit` to fetch the full candidate set — the Decision
// queue must rank against everything, not a pre-truncated slice.
export async function getRemindersNeedingAttention(
    limit?: number
): Promise<ReminderNeedingAttention[]> {
    const nowIso = new Date().toISOString();

    let query = supabase
        .from("reminders")
        .select(
            `
            id,
            customer_id,
            reminder_stage,
            channel,
            scheduled_at,
            customers (
                company_name
            ),
            invoices!inner (
                invoice_number,
                status,
                balance_due
            )
        `
        )
        .eq("delivery_status", "pending")
        .is("actioned_at", null)
        .lte("scheduled_at", nowIso)
        .neq("invoices.status", "paid")
        .order("scheduled_at", { ascending: true });

    if (limit !== undefined) {
        query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;

    const rows = (data ?? []) as unknown as ReminderNeedingAttentionRow[];

    return rows.map((reminder) => ({
        id: reminder.id,
        customerId: reminder.customer_id,
        customerName:
            reminder.customers?.company_name ?? "Unknown customer",
        invoiceNumber: reminder.invoices?.invoice_number ?? "—",
        balanceDue: Number(reminder.invoices?.balance_due ?? 0),
        reminderStage: reminder.reminder_stage,
        channel: reminder.channel,
        scheduledAt: reminder.scheduled_at,
    }));
}

// Explicit human action evidence. Deliberately does not touch
// delivery_status — "sent" and "actioned" are different claims.
export async function markReminderActioned(
    reminderId: string
): Promise<void> {
    const { error } = await supabase
        .from("reminders")
        .update({
            actioned_at: new Date().toISOString(),
        })
        .eq("id", reminderId);

    if (error) throw error;
}

export async function getReminderFollowUpsActionedTodayCount(): Promise<number> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { count, error } = await supabase
        .from("reminders")
        .select("*", {
            head: true,
            count: "exact",
        })
        .gte("actioned_at", start.toISOString())
        .lte("actioned_at", end.toISOString());

    if (error) throw error;

    return count ?? 0;
}

export async function getNextReminderForCustomer(
    customerId: string
): Promise<NextReminder | null> {
    const { data, error } = await supabase
        .from("reminders")
        .select("reminder_stage, scheduled_at, channel")
        .eq("customer_id", customerId)
        .eq("delivery_status", "pending")
        .order("scheduled_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    if (!data) return null;

    return {
        reminderStage: data.reminder_stage,
        scheduledAt: data.scheduled_at,
        channel: data.channel,
    };
}