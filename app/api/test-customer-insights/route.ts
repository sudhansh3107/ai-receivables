import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";


import {
    refreshCustomerInsights,
} from "@/services/server/customerInsightService";


export async function GET() {
    try {
        const customerId =
            "0cc0d1dc-6e58-472e-9aa2-f70ae98704c6";

        // Calculate deterministic customer insights once
        

        // Get the customer's invoice currency
        const {
            data: invoices,
            error: invoiceError,
        } = await supabase
            .from("invoices")
            .select("currency")
            .eq(
                "customer_id",
                customerId
            );

        if (invoiceError) {
            throw invoiceError;
        }

        const currency =
            invoices?.[0]?.currency ?? "INR";

        // Send the already-calculated insights to AI
        
        
        const saved =
    await refreshCustomerInsights(
        customerId
    );

return NextResponse.json({
    customerId,
    saved,
});
        
        
    } catch (error) {

        console.error(
            "Customer Insights Test Failed:",
            error
        );

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 500 }
        );
    }
}