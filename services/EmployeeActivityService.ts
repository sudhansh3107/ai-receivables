import { supabase } from "@/lib/supabase";

export interface EmployeeActivityInput {
    uploadSessionId?: string;
    invoiceFileId?: string;

    activityType: string;
    message: string;
}

export async function logEmployeeActivity(
    input: EmployeeActivityInput
) {
    const { data, error } = await supabase
        .from("employee_activity")
        .insert({
            upload_session_id: input.uploadSessionId ?? null,
            invoice_file_id: input.invoiceFileId ?? null,

            activity_type: input.activityType,
            message: input.message,
        })
        .select()
        .single();

    if (error) {
        throw error;
    }

    return data;
}

export async function getEmployeeActivity(
    uploadSessionId: string,
    limit = 3
) {
    const { data, error } = await supabase
        .from("employee_activity")
        .select(`
            *,
            invoice_files (
                file_name
            )
        `)
        .or(
    `upload_session_id.eq.${uploadSessionId},upload_session_id.is.null`
)
        .order("created_at", {
            ascending: false,
        })
        .limit(limit);

    if (error) {
        throw error;
    }

    console.log(
    "🔎 Employee Activity Query Result:",
    data
);

    return data;
}

export function subscribeToEmployeeActivity(
    uploadSessionId: string,
    callback: () => void
) {
    const channel = supabase.channel(
        `employee_activity:${uploadSessionId}`
    );

    channel.on(
        "postgres_changes",
        {
            event: "*",
            schema: "public",
            table: "employee_activity",
            filter: `upload_session_id=eq.${uploadSessionId}`,
        },
        () => {
            callback();
        }
    );

    channel.subscribe((status) => {
        console.log("Realtime Status:", status);
    });

    return channel;
}