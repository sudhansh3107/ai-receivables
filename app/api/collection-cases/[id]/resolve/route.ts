import { NextRequest, NextResponse } from "next/server";
import { markCollectionCaseResolvedManually } from "@/services/server/collectionCaseService";

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

        const result = await markCollectionCaseResolvedManually(id);

        return NextResponse.json({
            success: true,
            status: result.status,
        });
    } catch (error) {
        console.error("Collection Case Manual Resolve Error:", error);

        return NextResponse.json(
            {
                success: false,
                message: "Failed to resolve collection case.",
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            },
            { status: 400 }
        );
    }
}
