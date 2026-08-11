import { NextRequest, NextResponse } from "next/server";
import { deferPaymentDecision } from "@/services/server/paymentDecisionExecutionService";

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

        const result = await deferPaymentDecision(id);

        return NextResponse.json({
            success: true,
            outcome: result.outcome,
            decision: result.decision,
        });
    } catch (error) {
        console.error("Payment Decision Wait Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to defer payment decision.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
