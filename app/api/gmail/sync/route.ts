import { NextResponse } from "next/server";
import { getGmailClientForConnection } from "@/lib/google";
import {
    getPrimaryGmailConnection,
    getDecryptedRefreshToken,
} from "@/services/server/gmailConnectionService";
import { syncGmailConnection } from "@/services/server/gmailSyncService";

export async function POST() {
    try {
        const connection = await getPrimaryGmailConnection();

        if (!connection) {
            return NextResponse.json(
                {
                    error:
                        "No durable Gmail connection found. Connect Gmail first.",
                },
                { status: 401 }
            );
        }

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

        return NextResponse.json(result);
    } catch (error) {
        console.error("Gmail Sync Error:", error);

        return NextResponse.json(
            {
                error: "Failed to sync Gmail messages",
            },
            { status: 500 }
        );
    }
}
