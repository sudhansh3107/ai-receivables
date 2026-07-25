import { NextRequest, NextResponse } from "next/server";
import { testOpenAI } from "@/services/server/invoiceExtractionService";

export async function POST(request: NextRequest) {
  try {
    // Read the request body (we're not using filePath yet)
    await request.json();

    // Test the OpenAI connection
    const message = await testOpenAI();

    return NextResponse.json({
      success: true,
      message,
    });
  } catch (error) {
    console.error("OpenAI Test Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to connect to OpenAI.",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}