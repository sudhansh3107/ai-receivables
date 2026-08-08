import { NextRequest, NextResponse } from "next/server";
import { googleOAuth2Client } from "@/lib/google";
import { cookies } from "next/headers";

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

    try {
        const { tokens } =
            await googleOAuth2Client.getToken(
                code
            );
        
        
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

        return NextResponse.json({
            success: true,
            message:
                "Gmail connected successfully",
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