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

        const result = await approvePaymentDecision(id);

        if (result.outcome === "approved") {
            return NextResponse.json({
                success: true,
                outcome: "approved",
                decision: result.decision,
            });
        }

        if (result.outcome === "already_paid") {
            return NextResponse.json({
                success: true,
                outcome: "already_paid",
                decision: result.decision,
                message: "Payment already received — no action required.",
            });
        }

        return NextResponse.json({
            success: false,
            outcome: "needs_review",
            decision: result.decision,
            reason: result.reason,
            currentBalance: result.currentBalance,
            message:
                "The proposed amount exceeds the invoice's current balance and needs manual review.",
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
