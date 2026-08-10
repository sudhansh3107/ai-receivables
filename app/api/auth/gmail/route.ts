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

    return NextResponse.redirect(authUrl);
}