import { supabase } from "@/lib/supabase";
import { NormalizedEmail } from "@/lib/gmail/parse-email";

export async function upsertEmailFromGmail(
    normalized: NormalizedEmail
) {
    const { data, error } = await supabase
        .from("emails")
        .upsert(
            {
                gmail_message_id: normalized.messageId,
                gmail_thread_id: normalized.threadId,

                from_email: normalized.from,
                to_emails: normalized.to,
                cc_emails: normalized.cc,

                subject: normalized.subject || null,
                received_at: new Date(
                    normalized.receivedAt
                ).toISOString(),

                text_body: normalized.textBody,
                html_body: normalized.htmlBody,

                attachments: normalized.attachments,

                processing_status: "received",
            },
            { onConflict: "gmail_message_id" }
        )
        .select()
        .single();

    if (error) throw error;

    return data;
}
