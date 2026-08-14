import { NextRequest, NextResponse } from "next/server";
import {
    getCustomersNeedingNewCase,
    getCasesDueForEvaluation,
} from "@/services/server/collectionCaseService";
import { evaluateOrOpenCollectionCase } from "@/services/server/collectionCaseOrchestrationService";

const BACKFILL_BATCH_SIZE = 25;

interface BackfillResult {
    customerId: string;
    label: string;
    success: boolean;
    error?: string;
}

// Shared by both POST (manual trigger) and GET (Vercel Cron), mirroring
// /api/receivables-assessments/backfill and /api/customer-insights/backfill
// exactly. Two passes, both time-driven (§ approved design — Responsibility
// #3 has no discrete "invoice became overdue" event to hook, so this
// backfill is what notices it):
//
//   1. Customers whose live #2 assessment already warrants attention but
//      have no active collection case yet (opens one, per T1).
//   2. Existing cases whose next_evaluation_at has elapsed (promise dates
//      passing, no-response windows expiring, blocker/dispute
//      re-evaluation intervals, etc.).
//
// Both reuse the SAME evaluateOrOpenCollectionCase() entry point every
// other trigger site in this codebase calls — no separate logic path.
async function runBackfill(): Promise<NextResponse> {
    try {
        const results: BackfillResult[] = [];

        const customersNeedingNewCase = await getCustomersNeedingNewCase(
            BACKFILL_BATCH_SIZE
        );

        // Sequential, not Promise.all — one customer's failure must
        // never stop the rest of the batch.
        for (const customer of customersNeedingNewCase) {
            try {
                await evaluateOrOpenCollectionCase(customer.id);

                results.push({
                    customerId: customer.id,
                    label: customer.companyName,
                    success: true,
                });
            } catch (error) {
                console.error(
                    `❌ Collection Case Open Backfill Failed — ${customer.companyName} (${customer.id})`
                );
                console.error(error);

                results.push({
                    customerId: customer.id,
                    label: customer.companyName,
                    success: false,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        }

        const dueCases = await getCasesDueForEvaluation(BACKFILL_BATCH_SIZE);

        for (const collectionCase of dueCases) {
            try {
                await evaluateOrOpenCollectionCase(
                    collectionCase.customer_id
                );

                results.push({
                    customerId: collectionCase.customer_id,
                    label: collectionCase.id,
                    success: true,
                });
            } catch (error) {
                console.error(
                    `❌ Collection Case Re-evaluation Backfill Failed — case ${collectionCase.id}`
                );
                console.error(error);

                results.push({
                    customerId: collectionCase.customer_id,
                    label: collectionCase.id,
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
            succeeded: results.filter((result) => result.success).length,
            failed: results.filter((result) => !result.success).length,
            results,
        });
    } catch (error) {
        console.error("Collection Case Backfill Error:", error);

        return NextResponse.json(
            { error: "Failed to run collection case backfill" },
            { status: 500 }
        );
    }
}

// Manual trigger — no auth, matches the existing backfill/sync routes'
// manual-trigger access model.
export async function POST(): Promise<NextResponse> {
    return runBackfill();
}

// Vercel Cron trigger — same CRON_SECRET bearer-auth convention as the
// three existing backfill/sync routes.
export async function GET(
    request: NextRequest
): Promise<NextResponse> {
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error(
            "Collection Case Backfill (cron) - CRON_SECRET is not configured on the server"
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
