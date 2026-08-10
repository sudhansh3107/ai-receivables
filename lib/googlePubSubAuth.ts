import { google } from "googleapis";

// Bare OAuth2Client used only for verifyIdToken() — it needs no
// clientId/secret of its own; verification is purely against
// Google's public signing certs plus the audience we pass in.
const verifierClient = new google.auth.OAuth2();

export interface PubSubAuthResult {
    verified: boolean;
    email?: string;
    reason?: string;
}

// Verifies a Pub/Sub push request's Authorization header per Google's
// documented push authentication model:
// https://cloud.google.com/pubsub/docs/push#authentication
//
// This must run BEFORE any part of the request body is trusted. The
// emailAddress/historyId inside the Pub/Sub message payload are never
// treated as authentication — only this OIDC token is.
export async function verifyPubSubPushRequest(
    authorizationHeader: string | null
): Promise<PubSubAuthResult> {
    if (!authorizationHeader) {
        return {
            verified: false,
            reason: "Missing Authorization header",
        };
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
        // Never log the header value itself, even on failure.
        return {
            verified: false,
            reason: "Authorization header is not a Bearer token",
        };
    }

    const audience = process.env.GMAIL_PUBSUB_WEBHOOK_AUDIENCE;

    if (!audience) {
        return {
            verified: false,
            reason:
                "GMAIL_PUBSUB_WEBHOOK_AUDIENCE is not configured on the server",
        };
    }

    let email: string | undefined;
    let emailVerified: boolean | undefined;

    try {
        // verifyIdToken validates the JWT signature against Google's
        // public certs, checks the issuer is Google Accounts, checks
        // expiry, and checks the audience matches what we pass here.
        const ticket = await verifierClient.verifyIdToken({
            idToken: token,
            audience,
        });

        const payload = ticket.getPayload();

        email = payload?.email;
        emailVerified = payload?.email_verified;
    } catch (error) {
        console.error(
            "Pub/Sub push OIDC verification failed:",
            error instanceof Error ? error.message : "Unknown error"
        );

        return {
            verified: false,
            reason:
                "Token signature, issuer, expiry, or audience verification failed",
        };
    }

    if (!email || !emailVerified) {
        return {
            verified: false,
            reason: "Token payload is missing a verified email",
        };
    }

    const expectedServiceAccount =
        process.env.GMAIL_PUBSUB_SERVICE_ACCOUNT_EMAIL;

    if (
        expectedServiceAccount &&
        email !== expectedServiceAccount
    ) {
        return {
            verified: false,
            reason:
                "Token email does not match the configured Pub/Sub push service account",
        };
    }

    return { verified: true, email };
}
