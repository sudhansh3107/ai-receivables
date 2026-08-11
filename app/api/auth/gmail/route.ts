import { NextRequest, NextResponse } from "next/server";
import { googleOAuth2Client } from "@/lib/google";
import { getPrimaryGmailConnection } from "@/services/server/gmailConnectionService";

export async function GET(request: NextRequest) {
    // A durable connection already exists — its refresh token is
    // reused by Gmail sync regardless of this route, so there is
    // nothing for a fresh OAuth consent to accomplish here. Skip it
    // rather than forcing the user through Google sign-in again.
    const existingConnection = await getPrimaryGmailConnection();

    if (existingConnection) {
        return NextResponse.redirect(
            new URL("/?gmail=connected", request.url)
        );
    }

    const authUrl =
        googleOAuth2Client.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
            ],
        });

    return NextResponse.redirect(authUrl);
}
