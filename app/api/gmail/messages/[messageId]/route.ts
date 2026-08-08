import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getGmailClient } from "@/lib/google";
import { parseGmailMessage } from "@/lib/gmail/parse-email";

export async function GET(
    request: NextRequest,
    context: {
        params: Promise<{
            messageId: string;
        }>;
    }
) {
    try {
        const { messageId } = await context.params;

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
    await gmail.users.messages.get({
        userId: "me",
        id: messageId,
        format: "full",
    });

const parsedMessage = parseGmailMessage(response.data);

return NextResponse.json({
    success: true,
    message: parsedMessage,
});

    } catch (error) {
        console.error(
            "Gmail Message Error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Failed to read Gmail message",
            },
            { status: 500 }
        );
    }
}