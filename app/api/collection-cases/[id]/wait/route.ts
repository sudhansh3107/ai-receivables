import { NextRequest, NextResponse } from "next/server";
import { deferCollectionCaseEscalation } from "@/services/server/collectionCaseService";

// Named "wait" to mirror /api/payment-decisions/[id]/wait exactly — same
// "keep monitoring" concept, same 24-hour defer semantics, same
// deliberately NOT-an-approval framing.
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

        const result = await deferCollectionCaseEscalation(id);

        return NextResponse.json({
            success: true,
            outcome: result.outcome,
        });
    } catch (error) {
        console.error("Collection Case Wait Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to defer collection case escalation.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
