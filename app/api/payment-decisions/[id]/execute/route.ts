import { NextRequest, NextResponse } from "next/server";
import { executePaymentDecision } from "@/services/server/paymentDecisionExecutionService";

// The human approval boundary is enforced inside
// executePaymentDecision() itself (it only ever claims a decision that
// is already status="approved"), not here — this route is a plain
// human-triggered execute action, never invoked automatically by AI
// classification/matching.
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

        const result = await executePaymentDecision(id);

        if (result.outcome === "already_paid") {
            return NextResponse.json({
                success: true,
                outcome: "already_paid",
                decision: result.decision,
                message: "Payment already received — no action required.",
            });
        }

        return NextResponse.json({
            success: result.outcome === "executed",
            ...result,
        });
    } catch (error) {
        console.error("Payment Decision Execute Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to execute payment decision.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
