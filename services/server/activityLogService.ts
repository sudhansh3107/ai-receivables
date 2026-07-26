import { supabase } from "@/lib/supabase";
import { ActivityType } from "@/lib/activityTypes";

export interface ActivityLogInput {
    invoiceId?: string;
    customerId?: string;

    activityType: ActivityType;
    description: string;

    metadata?: Record<string, unknown>;
}

export async function logActivity(
    input: ActivityLogInput
) {
    const { data, error } = await supabase
        .from("activity_log")
        .insert({
            invoice_id: input.invoiceId ?? null,
            customer_id: input.customerId ?? null,

            activity_type: input.activityType,
            description: input.description,

            metadata: input.metadata ?? null,
        })
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function logInvoiceActivity(
    invoiceId: string,
    customerId: string,
    activityType: ActivityType,
    description: string,
    metadata?: Record<string, unknown>
) {
    return logActivity({
        invoiceId,
        customerId,
        activityType,
        description,
        metadata,
    });
}

export async function logCustomerActivity(
    customerId: string,
    activityType: ActivityType,
    description: string,
    metadata?: Record<string, unknown>
) {
    return logActivity({
        customerId,
        activityType,
        description,
        metadata,
    });
}