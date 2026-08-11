import { getGmailClientForConnection } from "@/lib/google";
import {
    getPrimaryGmailConnection,
    getDecryptedRefreshToken,
} from "@/services/server/gmailConnectionService";

export interface OriginalMessageMetadata {
    // The RFC 2822 "Message-ID" header value, stripped of surrounding
    // angle brackets — NOT Gmail's internal message id (emails.
    // gmail_message_id / message.id). The two are different identifiers;
    // only this one is valid for In-Reply-To/References. See
    // services/server/paymentProofRequestService.ts, the sole caller.
    rfcMessageId: string | null;
}

function stripAngleBrackets(value: string): string {
    return value.trim().replace(/^</, "").replace(/>$/, "");
}

// Reads the RFC Message-ID header off an existing Gmail message, by
// Gmail's own internal message id. Generic (not payment-decision-specific)
// so any future same-thread-reply feature (e.g. Reminders replying to a
// customer thread) can reuse it. Never invents a value: returns
// `rfcMessageId: null` when the header is genuinely absent, and throws (not
// swallows) when the message itself cannot be fetched at all — both are
// distinct failure modes the caller must handle without falling back to a
// new standalone email.
export async function getOriginalMessageMetadata(
    gmailMessageId: string
): Promise<OriginalMessageMetadata> {
    const connection = await getPrimaryGmailConnection();

    if (!connection) {
        throw new Error(
            "No durable Gmail connection found. Connect Gmail first."
        );
    }

    const refreshToken = await getDecryptedRefreshToken(connection.id);

    const gmail = getGmailClientForConnection(connection.id, refreshToken);

    const response = await gmail.users.messages.get({
        userId: "me",
        id: gmailMessageId,
        format: "metadata",
        metadataHeaders: ["Message-ID"],
    });

    const header = response.data.payload?.headers?.find(
        (candidate) => candidate.name?.toLowerCase() === "message-id"
    );

    return {
        rfcMessageId: header?.value
            ? stripAngleBrackets(header.value)
            : null,
    };
}
