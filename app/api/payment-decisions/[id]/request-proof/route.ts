import { NextRequest, NextResponse } from "next/server";
import {
    requestPaymentProof,
    RequestProofRejectedError,
} from "@/services/server/paymentProofRequestService";

// The client supplies ONLY the decision id (see lib/paymentDecisionActions.ts
// ::requestPaymentProofRequest()) — recipient, invoice, amount, and the
// original message/thread are all resolved server-side inside
// requestPaymentProof() from trusted database/Gmail state, never from the
// request body. This never approves, executes, or creates a payment; the
// decision is left exactly as it was, whether this succeeds or fails.
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

        const result = await requestPaymentProof(id);

        return NextResponse.json({
            success: true,
            outcome: "sent",
            ...result,
        });
    } catch (error) {
        if (error instanceof RequestProofRejectedError) {
            return NextResponse.json(
                {
                    success: false,
                    outcome: error.reason,
                    message: error.message,
                },
                { status: 409 }
            );
        }

        console.error("Payment Decision Request Proof Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to send proof request.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 500 }
        );
    }
}
