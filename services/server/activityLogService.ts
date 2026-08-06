import { supabase } from "@/lib/supabase";
import { ActivityType } from "@/lib/activityTypes";
import { mapActivityLog } from "./activityMapper";

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

export async function getRecentActivity(limit = 3) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);

    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const { data, error } = await supabase
        .from("activity_log")
        .select(`
            *,
            invoices (
                invoice_number
            ),
            customers (
                company_name
            )
        `)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", {
            ascending: false,
        })
        .limit(limit);

    if (error) throw error;

    return data.map(mapActivityLog);
}