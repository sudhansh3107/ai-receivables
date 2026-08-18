import { NextRequest, NextResponse } from "next/server";
import { provideCollectionCaseGuidance } from "@/services/server/collectionCaseService";

// Responsibility #9 — a human answering the employee's proactive
// "what happened, and how should I proceed?" prompt on an escalated
// case. All business logic (escalated-only precondition, non-empty
// validation, the CAS-guarded resume transition, and the activity-log
// write) lives in provideCollectionCaseGuidance() itself — this route
// is a thin parse-and-respond wrapper, same shape as every other
// collection-case human-action route in this directory.
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

        const body = await request.json().catch(() => ({}));
        const guidance = typeof body?.guidance === "string" ? body.guidance : "";

        const result = await provideCollectionCaseGuidance(id, guidance);

        return NextResponse.json({
            success: true,
            status: result.status,
        });
    } catch (error) {
        console.error("Collection Case Provide Guidance Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to record guidance for this case.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
