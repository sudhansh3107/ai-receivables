import { NextRequest, NextResponse } from "next/server";
import {
    getCustomersMissingInsights,
    refreshCustomerInsights,
} from "@/services/server/customerInsightService";

const BACKFILL_BATCH_SIZE = 25;

interface BackfillResult {
    customerId: string;
    companyName: string;
    success: boolean;
    error?: string;
}

// Shared by both POST (manual trigger) and GET (Vercel Cron) so the
// discovery + processing logic is never duplicated between them — the
// only difference between the two handlers is how the request is
// authorized. Mirrors the /api/gmail/sync pattern.
async function runBackfill(): Promise<NextResponse> {
    try {
        const customers = await getCustomersMissingInsights(
            BACKFILL_BATCH_SIZE
        );

        const results: BackfillResult[] = [];

        // Sequential, not Promise.all — one customer's failure must
        // never stop the rest of the batch, and this avoids firing
        // OpenAI calls for the whole batch in an uncontrolled burst.
        for (const customer of customers) {
            try {
                await refreshCustomerInsights(customer.id);

                results.push({
                    customerId: customer.id,
                    companyName: customer.companyName,
                    success: true,
                });
            } catch (error) {
                console.error(
                    `❌ Customer Insights Backfill Failed — ${customer.companyName} (${customer.id})`
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
            "Customer Insights Backfill Error:",
            error
        );

        return NextResponse.json(
            {
                error: "Failed to run customer insights backfill",
            },
            { status: 500 }
        );
    }
}

// Manual trigger — no auth, matches the existing /api/gmail/sync
// manual-trigger access model.
export async function POST(): Promise<NextResponse> {
    return runBackfill();
}

// Vercel Cron trigger. Vercel invokes cron job paths with GET and
// sends the configured CRON_SECRET as `Authorization: Bearer
// <CRON_SECRET>` — verified here before any backfill work runs. The
// response never echoes the secret or anything derived from it, only
// a generic 401 on missing/invalid auth.
export async function GET(
    request: NextRequest
): Promise<NextResponse> {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error(
            "Customer Insights Backfill (cron) - CRON_SECRET is not configured on the server"
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
