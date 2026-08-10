import { getGmailClientForConnection } from "@/lib/google";
import {
    GmailConnection,
    getDecryptedRefreshToken,
    updateWatchExpiration,
} from "@/services/server/gmailConnectionService";

export interface GmailWatchResult {
    expiration: string; // ISO 8601
    topicName: string;
}

// Registers (or renews) a Gmail watch for the given durable
// connection, pointing at the Pub/Sub topic configured via
// GMAIL_PUBSUB_TOPIC_NAME. This only registers the watch — it does
// not create the topic/subscription or grant IAM permissions, all of
// which must already exist in Google Cloud (see audit).
export async function registerGmailWatch(
    connection: GmailConnection
): Promise<GmailWatchResult> {
    const topicName = process.env.GMAIL_PUBSUB_TOPIC_NAME;

    if (!topicName) {
        throw new Error(
            "GMAIL_PUBSUB_TOPIC_NAME environment variable is not set. " +
                "Expected format: projects/<project-id>/topics/<topic-name>."
        );
    }

    const refreshToken = await getDecryptedRefreshToken(
        connection.id
    );

    const gmail = getGmailClientForConnection(
        connection.id,
        refreshToken
    );

    const response = await gmail.users.watch({
        userId: "me",
        requestBody: {
            topicName,
        },
    });

    const expirationMillis = response.data.expiration;

    if (!expirationMillis) {
        throw new Error(
            "Gmail watch() did not return an expiration."
        );
    }

    const expirationIso = new Date(
        Number(expirationMillis)
    ).toISOString();

    await updateWatchExpiration(connection.id, expirationIso);

    return {
        expiration: expirationIso,
        topicName,
    };
}
