import { getGmailClientForConnection } from "@/lib/google";
import {
    getPrimaryGmailConnection,
    getDecryptedRefreshToken,
} from "@/services/server/gmailConnectionService";

export interface SendGmailReplyInput {
    to: string;
    subject: string;
    body: string;
    // Omitted entirely -> a brand-new email (e.g. a future Reminder).
    // Provided -> a same-thread reply (e.g. Request Proof). See
    // services/server/paymentProofRequestService.ts for the reply case.
    threadId?: string;
    inReplyTo?: string;
    references?: string;
}

export interface SendGmailReplyResult {
    messageId: string;
    threadId: string | null;
}

function base64UrlEncode(input: string): string {
    return Buffer.from(input, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

// RFC 2047 encoded-word fallback for a non-ASCII Subject header — everyday
// ASCII subjects (the common case here) pass through unchanged.
function encodeHeaderValue(value: string): string {
    if (/^[\x00-\x7F]*$/.test(value)) {
        return value;
    }

    return `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

// Generic, reusable outbound Gmail primitive — NOT specific to payment
// proof requests. Intended to also power the future Reminders workflow,
// which will call this with no threadId/inReplyTo/references (a fresh
// email) instead of a reply.
//
// Resolves the single durable Gmail connection server-side (see
// services/server/gmailConnectionService.ts) and builds the client via the
// EXISTING getGmailClientForConnection() — no new OAuth flow, no new Gmail
// client abstraction. Sender identity is always the connected account
// (connection.googleAccountEmail); it is never accepted as an input here,
// so a caller can never make this function send as an arbitrary mailbox.
//
// Constructs a minimal valid RFC 2822 / MIME message and base64url-encodes
// it, per Gmail API's requirement for messages.send's `raw` field.
export async function sendGmailReply(
    input: SendGmailReplyInput
): Promise<SendGmailReplyResult> {
    const connection = await getPrimaryGmailConnection();

    if (!connection) {
        throw new Error(
            "No durable Gmail connection found. Connect Gmail first."
        );
    }

    const refreshToken = await getDecryptedRefreshToken(connection.id);

    const gmail = getGmailClientForConnection(connection.id, refreshToken);

    const headers: string[] = [
        `From: ${connection.googleAccountEmail}`,
        `To: ${input.to}`,
        `Subject: ${encodeHeaderValue(input.subject)}`,
    ];

    // Both set together, from the same RFC Message-ID — Gmail's own
    // documented requirement for a reply to reliably land in the original
    // thread. Never set from Gmail's internal message id (see
    // lib/gmail/messages.ts for why those two are not interchangeable).
    if (input.inReplyTo) {
        headers.push(`In-Reply-To: <${input.inReplyTo}>`);
    }

    if (input.references) {
        headers.push(`References: <${input.references}>`);
    }

    headers.push(
        "MIME-Version: 1.0",
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: 7bit"
    );

    const mimeMessage = `${headers.join("\r\n")}\r\n\r\n${input.body}`;

    const response = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
            raw: base64UrlEncode(mimeMessage),
            threadId: input.threadId,
        },
    });

    const messageId = response.data.id;

    if (!messageId) {
        throw new Error("Gmail send succeeded but returned no message id.");
    }

    return {
        messageId,
        threadId: response.data.threadId ?? null,
    };
}
