import { google } from "googleapis";
import { rotateRefreshToken } from "@/services/server/gmailConnectionService";

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

// Durable-connection path: builds a Gmail client from a decrypted
// refresh token pulled from gmail_connections rather than browser
// cookies. Uses its own OAuth2Client instance (not the shared
// googleOAuth2Client singleton above) so its "tokens" listener is
// scoped to exactly one connectionId and doesn't race with the
// cookie-based path.
//
// google-auth-library refreshes the access token on demand using the
// refresh token; that refreshed access token is intentionally never
// persisted (access tokens are short-lived and cheap to re-derive).
// If Google ever rotates the refresh token itself, the "tokens" event
// fires with a new refresh_token and we persist it immediately so the
// old one is never relied on again.
export function getGmailClientForConnection(
    connectionId: string,
    refreshToken: string
) {
    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET,
        GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
        refresh_token: refreshToken,
    });

    oauth2Client.on("tokens", (tokens) => {
        if (!tokens.refresh_token) {
            return;
        }

        void rotateRefreshToken(
            connectionId,
            tokens.refresh_token
        ).catch((error) => {
            console.error(
                "Failed to persist rotated Gmail refresh token for connection",
                connectionId,
                error
            );
        });
    });

    return google.gmail({
        version: "v1",
        auth: oauth2Client,
    });
}

