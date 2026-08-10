import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getGmailClient } from "@/lib/google";
import { parseGmailMessage } from "@/lib/gmail/parse-email";
import { upsertEmailFromGmail } from "@/services/server/emailService";

export async function POST() {
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

        const listResponse =
            await gmail.users.messages.list({
                userId: "me",
                maxResults: 10,
            });

        const messageRefs =
            listResponse.data.messages ?? [];

        const persistedIds: string[] = [];

        const failures: {
            messageId: string | null | undefined;
            error: string;
        }[] = [];

        for (const messageRef of messageRefs) {
            if (!messageRef.id) {
                failures.push({
                    messageId: messageRef.id,
                    error: "Missing message id in list response",
                });

                continue;
            }

            try {
                const messageResponse =
                    await gmail.users.messages.get({
                        userId: "me",
                        id: messageRef.id,
                        format: "full",
                    });

                const normalized = parseGmailMessage(
                    messageResponse.data
                );

                await upsertEmailFromGmail(normalized);

                persistedIds.push(messageRef.id);
            } catch (error) {
                console.error(
                    "Gmail Sync - Message Failed:",
                    messageRef.id,
                    error
                );

                failures.push({
                    messageId: messageRef.id,
                    error:
                        error instanceof Error
                            ? error.message
                            : "Unknown error",
                });
            }
        }

        return NextResponse.json({
            success: failures.length === 0,
            attempted: messageRefs.length,
            persisted: persistedIds.length,
            failed: failures.length,
            persistedMessageIds: persistedIds,
            failures,
        });
    } catch (error) {
        console.error("Gmail Sync Error:", error);

        return NextResponse.json(
            {
                error: "Failed to sync Gmail messages",
            },
            { status: 500 }
        );
    }
}
