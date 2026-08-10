import { NextRequest, NextResponse } from "next/server";
import { googleOAuth2Client, getGmailClient } from "@/lib/google";
import { cookies } from "next/headers";
import { upsertGmailConnection } from "@/services/server/gmailConnectionService";

export async function GET(
    request: NextRequest
) {
    const code =
        request.nextUrl.searchParams.get("code");

    if (!code) {
        return NextResponse.json(
            {
                error:
                    "Missing authorization code",
            },
            { status: 400 }
        );
    }

    // TEMPORARY DIAGNOSTIC — verifies GOOGLE_REDIRECT_URI is actually
    // visible inside this specific serverless function's runtime,
    // before the token exchange is attempted. Remove after use.
    if (code) {
        return NextResponse.json({
            hasRedirectUriEnv: !!process.env.GOOGLE_REDIRECT_URI,
            redirectUriEnvValue: process.env.GOOGLE_REDIRECT_URI ?? null,
        });
    }

    try {
        const { tokens } =
            await googleOAuth2Client.getToken({
                code,
                redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
            });
        
        
        const cookieStore = await cookies();

cookieStore.set(
    "gmail_access_token",
    tokens.access_token ?? "",
    {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    }
);

cookieStore.set(
    "gmail_refresh_token",
    tokens.refresh_token ?? "",
    {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
    }
);

        console.log(
            "🔐 Gmail OAuth Tokens Received:",
            {
                hasAccessToken:
                    !!tokens.access_token,

                hasRefreshToken:
                    !!tokens.refresh_token,

                expiryDate:
                    tokens.expiry_date,
            }
        );

        // Best-effort durable persistence alongside the existing
        // cookie flow. Never let a failure here break the response
        // the browser flow already depends on — cookies above are
        // already set regardless of what happens next.
        let durableConnectionPersisted = false;

        if (tokens.access_token && tokens.refresh_token) {
            try {
                const gmail = getGmailClient(
                    tokens.access_token,
                    tokens.refresh_token
                );

                const profile =
                    await gmail.users.getProfile({
                        userId: "me",
                    });

                const googleAccountEmail =
                    profile.data.emailAddress;

                if (googleAccountEmail) {
                    await upsertGmailConnection(
                        googleAccountEmail,
                        tokens.refresh_token
                    );

                    durableConnectionPersisted = true;

                    console.log(
                        "🔒 Durable Gmail connection persisted for",
                        googleAccountEmail
                    );
                } else {
                    console.error(
                        "Gmail profile did not return an email address; durable connection not persisted."
                    );
                }
            } catch (error) {
                console.error(
                    "Failed to persist durable Gmail connection (cookie flow still active):",
                    error
                );
            }
        } else {
            console.error(
                "No refresh token returned by Google; durable Gmail connection not persisted."
            );
        }

        return NextResponse.json({
            success: true,
            message:
                "Gmail connected successfully",
            durableConnectionPersisted,
        });

    } catch (error) {
        console.error(
            "Gmail OAuth Error:",
            error
        );

        return NextResponse.json(
            {
                error:
                    "Failed to connect Gmail",
            },
            { status: 500 }
        );
    }
}