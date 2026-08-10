import { NextResponse } from "next/server";
import { getPrimaryGmailConnection } from "@/services/server/gmailConnectionService";
import { registerGmailWatch } from "@/services/server/gmailWatchService";

// Manual trigger only — no cron renewal in this slice. Gmail watches
// expire (typically after 7 days) and must be re-registered by
// calling this endpoint again before then.
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

        const result = await registerGmailWatch(connection);

        return NextResponse.json({
            success: true,
            expiration: result.expiration,
            topicName: result.topicName,
        });
    } catch (error) {
        console.error(
            "Gmail Watch Registration Error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to register Gmail watch",
            },
            { status: 500 }
        );
    }
}
