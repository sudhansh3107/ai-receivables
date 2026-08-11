import { supabase } from "@/lib/supabase";
import { NormalizedEmail } from "@/lib/gmail/parse-email";
import { EmailClassification } from "@/lib/emailClassification";

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

export async function getUnclassifiedEmails(limit: number) {
    const { data, error } = await supabase
        .from("emails")
        .select("id, subject, text_body, from_email, received_at")
        .eq("processing_status", "received")
        .order("received_at", { ascending: true })
        .limit(limit);

    if (error) throw error;

    return data;
}

export async function updateEmailClassification(
    emailId: string,
    classification: EmailClassification,
    confidence: number
) {
    const { data, error } = await supabase
        .from("emails")
        .update({
            classification,
            classification_confidence: confidence,
            processing_status: "processed",
            updated_at: new Date().toISOString(),
        })
        .eq("id", emailId)
        .select()
        .single();

    if (error) throw error;

    return data;
}

export async function markEmailClassificationFailed(
    emailId: string
) {
    const { error } = await supabase
        .from("emails")
        .update({
            processing_status: "failed",
            updated_at: new Date().toISOString(),
        })
        .eq("id", emailId);

    if (error) throw error;
}

// Set by the AR relevance gate (lib/emailRelevanceGate.ts) for mail
// that never reaches classifyEmail() — classification/confidence stay
// null, distinguishing "filtered before classification" from
// "classified as irrelevant" (EmailClassifications.IRRELEVANT).
export async function markEmailIgnored(emailId: string) {
    const { error } = await supabase
        .from("emails")
        .update({
            processing_status: "ignored",
            updated_at: new Date().toISOString(),
        })
        .eq("id", emailId);

    if (error) throw error;
}

// Employee-owned WORK signal for Mission Card (services/server/
// dashboardService.ts::getMissionSummary()): Gmail messages persisted
// but not yet run through the AR relevance gate / classification pass
// (see emailProcessingService.ts). Durable until the next sync+
// classify run — never includes payment_decisions, reminders, or
// invoice reviews, which are human-owned, not employee-owned.
export async function getReceivedEmailCount(): Promise<number> {
    const { count, error } = await supabase
        .from("emails")
        .select("*", {
            head: true,
            count: "exact",
        })
        .eq("processing_status", "received");

    if (error) throw error;

    return count ?? 0;
}
