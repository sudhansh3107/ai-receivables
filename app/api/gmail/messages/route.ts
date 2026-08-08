import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getGmailClient } from "@/lib/google";

export async function GET() {
    try {
        const cookieStore = await cookies();

        const accessToken =
            cookieStore.get(
                "gmail_access_token"
            )?.value;

        const refreshToken =
            cookieStore.get(
                "gmail_refresh_token"
            )?.value;

        if (!accessToken || !refreshToken) {
            return NextResponse.json(
                {
                    error:
                        "Gmail is not connected",
                },
                { status: 401 }
            );
        }

        const gmail = getGmailClient(
            accessToken,
            refreshToken
        );

        const response =
            await gmail.users.messages.list({
                userId: "me",
                maxResults: 10,
            });

        const messages =
            response.data.messages ?? [];

        return NextResponse.json({
            success: true,
            count: messages.length,
            messages,
        });
    } catch (error) {
        console.error(
            "Gmail Messages Error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Failed to read Gmail messages",
            },
            { status: 500 }
        );
    }
}