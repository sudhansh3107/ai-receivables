import { NextRequest, NextResponse } from "next/server";
import { resolveExceptionManually } from "@/services/server/collectionCaseService";
import { logActivity } from "@/services/server/activityLogService";
import { ActivityTypes } from "@/lib/activityTypes";

// Responsibility #7 — a human clearing a DISPUTE or PAYMENT_BLOCKER
// exception on a case that never escalated. Distinct from POST .../resolve
// (which closes the whole case, and only ever from status='escalated')
// and POST .../resume (which resumes a whole case FROM escalation) —
// neither applies here, since a non-escalated dispute/blocked case had
// no human action available at all before this endpoint.
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

        const result = await resolveExceptionManually(id);

        // exception_category/type are deliberately left populated by
        // resolveExceptionManually() (only exception_status flips to
        // 'resolved') specifically so this evidence bundle can describe
        // WHAT was resolved. The transition itself already succeeded —
        // a logging failure here must never be reported as the action
        // failing, same isolation as every other post-action logging in
        // this codebase.
        try {
            await logActivity({
                customerId: result.customer_id,
                activityType: ActivityTypes.COLLECTION_EXCEPTION_RESOLVED,
                description: `${
                    result.exception_category === "dispute" ? "Dispute" : "Blocker"
                } resolved manually by a human reviewer.`,
                metadata: {
                    caseId: result.id,
                    exceptionCategory: result.exception_category,
                    exceptionType: result.exception_type,
                    resolvedManually: true,
                },
            });
        } catch (activityError) {
            console.error(
                "Collection Case Exception Resolve - activity logging failed:",
                id,
                activityError
            );
        }

        return NextResponse.json({
            success: true,
            status: result.status,
        });
    } catch (error) {
        console.error("Collection Case Exception Resolve Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to resolve exception.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
