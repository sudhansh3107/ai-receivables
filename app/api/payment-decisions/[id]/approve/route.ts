import { NextRequest, NextResponse } from "next/server";
import { approvePaymentDecision } from "@/services/server/paymentDecisionExecutionService";

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

        const decision = await approvePaymentDecision(id);

        return NextResponse.json({
            success: true,
            decision,
        });
    } catch (error) {
        console.error("Payment Decision Approve Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to approve payment decision.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
