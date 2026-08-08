import { google } from "googleapis";

const GOOGLE_CLIENT_ID =
    process.env.GOOGLE_CLIENT_ID!;

const GOOGLE_CLIENT_SECRET =
    process.env.GOOGLE_CLIENT_SECRET!;

const GOOGLE_REDIRECT_URI =
    process.env.GOOGLE_REDIRECT_URI!;

export const googleOAuth2Client =
    new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );

export function getGmailClient(
    accessToken: string,
    refreshToken: string
) {
    googleOAuth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
    });

    return google.gmail({
        version: "v1",
        auth: googleOAuth2Client,
    });
}

