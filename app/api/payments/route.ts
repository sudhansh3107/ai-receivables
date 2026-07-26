import { NextRequest, NextResponse } from "next/server";
import { recordPayment } from "@/services/server/paymentService";

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