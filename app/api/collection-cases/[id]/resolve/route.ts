import { NextRequest, NextResponse } from "next/server";
import { markCollectionCaseResolvedManually } from "@/services/server/collectionCaseService";
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

        const result = await markCollectionCaseResolvedManually(id);

        // Reuses the existing COLLECTION_CASE_RESOLVED type (the
        // autonomous resolution paths in
        // collectionCaseOrchestrationService.ts already use it) rather
        // than introducing a new one — closed_reason='resolved_manual'
        // on the case row itself already distinguishes this from an
        // autonomous resolution; no new enum value needed. The
        // transition itself already succeeded — a logging failure here
        // must never be reported as the resolve failing.
        try {
            await logActivity({
                customerId: result.customer_id,
                activityType: ActivityTypes.COLLECTION_CASE_RESOLVED,
                description: "Manually resolved by a human reviewer.",
                metadata: { caseId: result.id, closedReason: "resolved_manual" },
            });
        } catch (activityError) {
            console.error(
                "Collection Case Manual Resolve - activity logging failed:",
                id,
                activityError
            );
        }

        return NextResponse.json({
            success: true,
            status: result.status,
        });
    } catch (error) {
        console.error("Collection Case Manual Resolve Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to resolve collection case.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
