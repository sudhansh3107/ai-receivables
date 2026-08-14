import { NextRequest, NextResponse } from "next/server";
import { resumeCollectionCaseFromEscalation } from "@/services/server/collectionCaseService";
import { logActivity } from "@/services/server/activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";

export async function POST(
    request: NextRequest,
    context: {
        params: Promise<{
            id: string;
        }>;
    }
) {
    try {
        const { id } = await context.params;

        const result = await resumeCollectionCaseFromEscalation(id);

        // The transition itself already succeeded — a logging failure
        // here must never be reported as the resume failing, same
        // isolation as collectionCaseOrchestrationService.ts's own
        // post-action logging.
        try {
            await logActivity({
                customerId: result.customer_id,
                activityType: ActivityTypes.COLLECTION_CASE_RESUMED_BY_HUMAN,
                description: "Collection case resumed by a human reviewer.",
                metadata: { caseId: result.id },
            });
        } catch (activityError) {
            console.error(
                "Collection Case Resume - activity logging failed:",
                id,
                activityError
            );
        }

        return NextResponse.json({
            success: true,
            status: result.status,
        });
    } catch (error) {
        console.error("Collection Case Resume Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to resume collection case.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
