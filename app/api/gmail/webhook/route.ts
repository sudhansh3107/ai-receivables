import { NextRequest, NextResponse } from "next/server";
import { verifyPubSubPushRequest } from "@/lib/googlePubSubAuth";
import { getGmailClientForConnection } from "@/lib/google";
import {
    getGmailConnectionByEmail,
    getDecryptedRefreshToken,
} from "@/services/server/gmailConnectionService";
import { syncGmailConnection } from "@/services/server/gmailSyncService";

interface PubSubPushEnvelope {
    message?: {
        data?: string;
        messageId?: string;
        publishTime?: string;
    };
    subscription?: string;
}

interface GmailPushNotification {
    emailAddress?: string;
    historyId?: string;
}

export async function POST(request: NextRequest) {
    // 1. Verify the request is genuinely from Google Pub/Sub BEFORE
    // parsing or trusting anything in the body.
    const authResult = await verifyPubSubPushRequest(
        request.headers.get("authorization")
    );

    if (!authResult.verified) {
        console.error(
            "Gmail Webhook - Rejected unverified request:",
            authResult.reason
        );

        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    // 2. Parse the Pub/Sub push envelope.
    let envelope: PubSubPushEnvelope;

    try {
        envelope = await request.json();
    } catch {
        return NextResponse.json(
            { error: "Malformed request body" },
            { status: 400 }
        );
    }

    const encodedData = envelope.message?.data;

    if (!encodedData || typeof encodedData !== "string") {
        return NextResponse.json(
            { error: "Missing message.data in Pub/Sub envelope" },
            { status: 400 }
        );
    }

    // 3. Decode the Gmail notification payload. historyId here is
    // informational only ("a change happened") — it is never used as
    // the sync cursor. The stored gmail_connections.last_history_id
    // is always the authoritative starting point (see step 5).
    let notification: GmailPushNotification;

    try {
        const decoded = Buffer.from(
            encodedData,
            "base64"
        ).toString("utf-8");

        notification = JSON.parse(decoded);
    } catch {
        return NextResponse.json(
            { error: "Malformed Gmail notification payload" },
            { status: 400 }
        );
    }

    if (!notification.emailAddress) {
        return NextResponse.json(
            { error: "Notification is missing emailAddress" },
            { status: 400 }
        );
    }

    try {
        // 4. Resolve which connection this notification belongs to.
        const connection = await getGmailConnectionByEmail(
            notification.emailAddress
        );

        if (!connection) {
            // Not an error — just a notification for an account we
            // don't have a durable connection for. Acknowledge so
            // Pub/Sub doesn't redeliver forever.
            console.log(
                "Gmail Webhook - No connection found, acknowledging no-op:",
                notification.emailAddress
            );

            return NextResponse.json({
                success: true,
                noop: true,
            });
        }

        // 5. Sync using the STORED cursor, never the notification's
        // historyId. The notification only tells us "something
        // changed" — the stored last_history_id is what determines
        // which history window we actually need to fetch.
        const refreshToken = await getDecryptedRefreshToken(
            connection.id
        );

        const gmail = getGmailClientForConnection(
            connection.id,
            refreshToken
        );

        const result = await syncGmailConnection(
            gmail,
            connection.id,
            connection.lastHistoryId
        );

        // Message-level failures are isolated and logged inside
        // syncGmailConnection/processMessages; as long as the sync
        // itself completed (the historyId cursor was safely
        // advanced), this is a successful Pub/Sub delivery. Retrying
        // a permanently-malformed message would not fix it, and
        // upsertEmailFromGmail's idempotency makes redelivery safe
        // either way.
        return NextResponse.json({
            success: true,
            mode: result.mode,
            persisted: result.persisted,
            failed: result.failed,
        });
    } catch (error) {
        // A genuine failure to sync (connection lookup, decryption,
        // or Gmail API failure before the cursor could be advanced) —
        // return non-2xx so Pub/Sub retries.
        console.error(
            "Gmail Webhook - Processing failed:",
            error
        );

        return NextResponse.json(
            { error: "Failed to process Gmail notification" },
            { status: 500 }
        );
    }
}
