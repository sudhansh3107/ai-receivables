import { NextRequest, NextResponse } from "next/server";
import {
    getCustomersMissingAssessment,
    refreshReceivablesAssessment,
} from "@/services/server/receivablesMonitoringService";

const BACKFILL_BATCH_SIZE = 25;

interface BackfillResult {
    customerId: string;
    companyName: string;
    success: boolean;
    error?: string;
}

// Shared by both POST (manual trigger) and GET (Vercel Cron), mirroring
// /api/customer-insights/backfill and /api/gmail/sync — the only
// difference between the two handlers is how the request is authorized.
async function runBackfill(): Promise<NextResponse> {
    try {
        const customers = await getCustomersMissingAssessment(
            BACKFILL_BATCH_SIZE
        );

        const results: BackfillResult[] = [];

        // Sequential, not Promise.all — one customer's failure must
        // never stop the rest of the batch.
        for (const customer of customers) {
            try {
                await refreshReceivablesAssessment(customer.id);

                results.push({
                    customerId: customer.id,
                    companyName: customer.companyName,
                    success: true,
                });
            } catch (error) {
                console.error(
                    `❌ Receivables Assessment Backfill Failed — ${customer.companyName} (${customer.id})`
                );
                console.error(error);

                results.push({
                    customerId: customer.id,
                    companyName: customer.companyName,
                    success: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        }

        return NextResponse.json({
            processed: results.length,
            succeeded: results.filter((result) => result.success)
                .length,
            failed: results.filter((result) => !result.success)
                .length,
            results,
        });
    } catch (error) {
        console.error(
            "Receivables Assessment Backfill Error:",
            error
        );

        return NextResponse.json(
            {
                error: "Failed to run receivables assessment backfill",
            },
            { status: 500 }
        );
    }
}

// Manual trigger — no auth, matches the existing backfill/sync routes'
// manual-trigger access model.
export async function POST(): Promise<NextResponse> {
    return runBackfill();
}

// Vercel Cron trigger — same CRON_SECRET bearer-auth convention as
// /api/customer-insights/backfill and /api/gmail/sync.
export async function GET(
    request: NextRequest
): Promise<NextResponse> {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error(
            "Receivables Assessment Backfill (cron) - CRON_SECRET is not configured on the server"
        );

        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const authHeader = request.headers.get("authorization");

    if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    return runBackfill();
}
