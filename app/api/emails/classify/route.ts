import { NextResponse } from "next/server";
import { processUnclassifiedEmails } from "@/services/server/emailProcessingService";

// Manual/standalone trigger for the same relevance-gate + classification
// pipeline that POST /api/gmail/sync now also runs automatically after
// every sync. Kept as its own endpoint for reprocessing a backlog or
// re-running independently of a sync.
export async function POST() {
    try {
        const result = await processUnclassifiedEmails();

        return NextResponse.json({
            success: result.failed === 0,
            ...result,
        });
    } catch (error) {
        console.error("Email Classification Error:", error);

        return NextResponse.json(
            {
                error: "Failed to classify emails",
            },
            { status: 500 }
        );
    }
}
