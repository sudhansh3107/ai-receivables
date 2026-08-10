import { NextResponse } from "next/server";
import { googleOAuth2Client } from "@/lib/google";

export async function GET() {
    const authUrl =
        googleOAuth2Client.generateAuthUrl({
            access_type: "offline",
            prompt: "consent",
            scope: [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
            ],
        });

    const parsed = new URL(authUrl);

    return NextResponse.json({
        hasRedirectUri: parsed.searchParams.has("redirect_uri"),
        redirectUri: parsed.searchParams.get("redirect_uri"),
        hasClientId: parsed.searchParams.has("client_id"),
    });
}