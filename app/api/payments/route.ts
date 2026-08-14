import { NextRequest, NextResponse } from "next/server";
import { recordPayment } from "@/services/server/paymentService";
import { evaluateOrOpenCollectionCase } from "@/services/server/collectionCaseOrchestrationService";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();

        const payment = await recordPayment({
            invoiceId: body.invoiceId,
            customerId: body.customerId,

            amount: body.amount,

            paymentDate: new Date(body.paymentDate),

            paymentMethod: body.paymentMethod,

            paymentReference: body.paymentReference,

            notes: body.notes,
        });

        // Responsibility #3 (Collections & Follow-Up) — deliberately
        // called here (an API route, server-only) rather than inside
        // recordPayment() itself; see services/server/paymentService.ts's
        // top-of-file note for why. Isolated in its own try/catch so a
        // case-evaluation failure can never turn a successfully recorded
        // payment into a reported failure.
        try {
            await evaluateOrOpenCollectionCase(body.customerId, {
                triggeredByPayment: true,
            });
        } catch (error) {
            console.error(
                "Collection Case Evaluation Failed (payment API):",
                error
            );
        }

        return NextResponse.json({
            success: true,
            payment,
        });
    } catch (error) {
        console.error("Payment API Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to record payment.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 500 }
        );
    }
}