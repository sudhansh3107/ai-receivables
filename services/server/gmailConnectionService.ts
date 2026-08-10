import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
    encryptRefreshToken,
    decryptRefreshToken,
} from "@/lib/googleTokenCrypto";

// Server-only. This table holds a long-lived Gmail credential and
// must never be reachable from client-side code or the anon Supabase
// client — always use supabaseAdmin (service role) here.

export interface GmailConnection {
    id: string;
    googleAccountEmail: string;
    lastHistoryId: string | null;
    watchExpiration: string | null;
    connectedAt: string;
    updatedAt: string;
}

interface GmailConnectionRow {
    id: string;
    google_account_email: string;
    last_history_id: string | null;
    watch_expiration: string | null;
    connected_at: string;
    updated_at: string;
}

function toConnection(row: GmailConnectionRow): GmailConnection {
    return {
        id: row.id,
        googleAccountEmail: row.google_account_email,
        lastHistoryId: row.last_history_id,
        watchExpiration: row.watch_expiration,
        connectedAt: row.connected_at,
        updatedAt: row.updated_at,
    };
}

const SAFE_COLUMNS =
    "id, google_account_email, last_history_id, watch_expiration, connected_at, updated_at";

// Creates the connection on first consent, or rotates the encrypted
// refresh token on re-consent for the same account. Never creates a
// duplicate row for the same google_account_email.
export async function upsertGmailConnection(
    googleAccountEmail: string,
    refreshToken: string
): Promise<GmailConnection> {
    const encryptedRefreshToken = encryptRefreshToken(refreshToken);

    const { data, error } = await supabaseAdmin
        .from("gmail_connections")
        .upsert(
            {
                google_account_email: googleAccountEmail,
                encrypted_refresh_token: encryptedRefreshToken,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "google_account_email" }
        )
        .select(SAFE_COLUMNS)
        .single();

    if (error) throw error;

    return toConnection(data as GmailConnectionRow);
}

// There is no user/org ownership model yet, so this MVP assumes a
// single connected Gmail account and returns the earliest-connected
// row. Revisit once multi-account/multi-tenant support exists.
export async function getPrimaryGmailConnection(): Promise<GmailConnection | null> {
    const { data, error } = await supabaseAdmin
        .from("gmail_connections")
        .select(SAFE_COLUMNS)
        .order("connected_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    if (error) throw error;

    return data ? toConnection(data as GmailConnectionRow) : null;
}

// Decrypted token is returned only for immediate server-side use
// (building a Gmail client). Never return this from an API route.
export async function getDecryptedRefreshToken(
    connectionId: string
): Promise<string> {
    const { data, error } = await supabaseAdmin
        .from("gmail_connections")
        .select("encrypted_refresh_token")
        .eq("id", connectionId)
        .single();

    if (error) throw error;

    return decryptRefreshToken(data.encrypted_refresh_token as string);
}

export async function updateLastHistoryId(
    connectionId: string,
    historyId: string
): Promise<void> {
    const { error } = await supabaseAdmin
        .from("gmail_connections")
        .update({
            last_history_id: historyId,
            updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);

    if (error) throw error;
}

// Unused today — no watch()/Pub/Sub in this slice — but the column
// and update path exist now so that slice can persist renewal state
// without another migration.
export async function updateWatchExpiration(
    connectionId: string,
    watchExpiration: string | null
): Promise<void> {
    const { error } = await supabaseAdmin
        .from("gmail_connections")
        .update({
            watch_expiration: watchExpiration,
            updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);

    if (error) throw error;
}

// Google may rotate the refresh token during automatic access-token
// refresh. Persist the new one so the old (now possibly invalid) one
// is never relied on again.
export async function rotateRefreshToken(
    connectionId: string,
    newRefreshToken: string
): Promise<void> {
    const encryptedRefreshToken = encryptRefreshToken(newRefreshToken);

    const { error } = await supabaseAdmin
        .from("gmail_connections")
        .update({
            encrypted_refresh_token: encryptedRefreshToken,
            updated_at: new Date().toISOString(),
        })
        .eq("id", connectionId);

    if (error) throw error;
}
