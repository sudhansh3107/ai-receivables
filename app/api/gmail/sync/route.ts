import { NextRequest, NextResponse } from "next/server";
import { getGmailClientForConnection } from "@/lib/google";
import {
    getPrimaryGmailConnection,
    getDecryptedRefreshToken,
} from "@/services/server/gmailConnectionService";
import { syncGmailConnection } from "@/services/server/gmailSyncService";
import {
    processUnclassifiedEmails,
    EmailProcessingResult,
} from "@/services/server/emailProcessingService";

// Shared by both POST (manual trigger) and GET (Vercel Cron) so the
// sync + processing pipeline is never duplicated between them — the
// only difference between the two handlers is how the request is
// authorized.
async function runGmailSync(): Promise<NextResponse> {
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

        const syncResult = await syncGmailConnection(
            gmail,
            connection.id,
            connection.lastHistoryId
        );

        // Runs the same relevance-gate + classification pipeline
        // /api/emails/classify uses, so a single sync call is now
        // sufficient for normal operation instead of two manual calls.
        // Isolated in its own try/catch: a failure here (e.g. OpenAI
        // outage) must never be reported as a failed sync — the sync
        // itself already succeeded and its result is unaffected.
        let processingResult: EmailProcessingResult | null = null;
        let processingError: string | null = null;

        try {
            processingResult = await processUnclassifiedEmails();
        } catch (error) {
            console.error(
                "Gmail Sync - Post-sync email processing failed:",
                error
            );

            processingError =
                error instanceof Error
                    ? error.message
                    : "Unknown error";
        }

        return NextResponse.json({
            success:
                syncResult.success &&
                processingResult !== null &&
                processingResult.failed === 0,
            sync: syncResult,
            processing: processingResult,
            processingError,
        });
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

// Manual trigger — unchanged behavior, no auth (matches this route's
// existing, pre-existing access model).
export async function POST(): Promise<NextResponse> {
    return runGmailSync();
}

// Vercel Cron trigger. Vercel invokes cron job paths with GET and
// sends the configured CRON_SECRET as `Authorization: Bearer
// <CRON_SECRET>` — verified here before any sync work runs. The
// response never echoes the secret or anything derived from it, only
// a generic 401 on missing/invalid auth.
export async function GET(request: NextRequest): Promise<NextResponse> {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error(
            "Gmail Sync (cron) - CRON_SECRET is not configured on the server"
        );

        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    return runGmailSync();
}
