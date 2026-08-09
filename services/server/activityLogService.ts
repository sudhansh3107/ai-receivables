import { supabase } from "@/lib/supabase";
import { ActivityType } from "@/lib/activityTypes";
import { mapActivityLog, EmployeeActivity } from "./activityMapper";

export interface ActivityLogInput {
    invoiceId?: string | null;
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
    invoiceId: string | null,
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

// mapActivityLog()'s `time` is HH:MM only (no date), which is
// ambiguous once results span more than one day. Rather than
// changing the shared mapper (used by the live dashboard),
// getActivityHistory carries the raw created_at alongside each
// mapped entry so callers can group by calendar day themselves.
export interface ActivityHistoryEntry extends EmployeeActivity {
    createdAt: string;
}

// Full chronological activity history for the /activity page — same
// table and joins as getRecentActivity, but with no today-only date
// filter. `limit` is an MVP safety cap on the query, not a claim of
// unlimited historical data; there is no pagination beyond it.
export async function getActivityHistory(
    limit = 200
): Promise<ActivityHistoryEntry[]> {
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
        .order("created_at", {
            ascending: false,
        })
        .limit(limit);

    if (error) throw error;

    return data.map((row) => ({
        ...mapActivityLog(row),
        createdAt: row.created_at,
    }));
}