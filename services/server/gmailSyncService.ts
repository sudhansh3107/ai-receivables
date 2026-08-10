import { gmail_v1 } from "googleapis";
import { parseGmailMessage } from "@/lib/gmail/parse-email";
import { upsertEmailFromGmail } from "@/services/server/emailService";
import { updateLastHistoryId } from "@/services/server/gmailConnectionService";

const INITIAL_SYNC_MAX_RESULTS = 10;

export interface SyncFailure {
    messageId: string | null | undefined;
    error: string;
}

export interface SyncResult {
    success: boolean;
    mode: "initial" | "incremental";
    resynced: boolean;
    attempted: number;
    persisted: number;
    failed: number;
    persistedMessageIds: string[];
    failures: SyncFailure[];
    historyId: string;
}

interface MessageProcessingResult {
    persistedIds: string[];
    failures: SyncFailure[];
}

// Shared persistence tail for both the initial and incremental sync
// paths, and now also the Pub/Sub webhook: message ID ->
// messages.get() -> parseGmailMessage() -> upsertEmailFromGmail().
// One message's failure never stops the rest of the batch.
//
// Concurrency note: this loop is safe to run concurrently across
// invocations for the SAME connection because upsertEmailFromGmail
// upserts on gmail_message_id — re-processing the same message twice
// (e.g. from overlapping webhook deliveries) is a harmless no-op, not
// a duplicate row. What is NOT protected against here is a race on
// gmail_connections.last_history_id itself if two syncs for the same
// connection run concurrently (see updateLastHistoryId callers) —
// that is a known, documented limitation, not solved in this slice.
export async function processMessages(
    gmail: gmail_v1.Gmail,
    messageIds: (string | null | undefined)[]
): Promise<MessageProcessingResult> {
    const persistedIds: string[] = [];
    const failures: SyncFailure[] = [];

    for (const messageId of messageIds) {
        if (!messageId) {
            failures.push({
                messageId,
                error: "Missing message id",
            });

            continue;
        }

        try {
            const messageResponse =
                await gmail.users.messages.get({
                    userId: "me",
                    id: messageId,
                    format: "full",
                });

            const normalized = parseGmailMessage(
                messageResponse.data
            );

            await upsertEmailFromGmail(normalized);

            persistedIds.push(messageId);
        } catch (error) {
            console.error(
                "Gmail Sync - Message Failed:",
                messageId,
                error
            );

            failures.push({
                messageId,
                error:
                    error instanceof Error
                        ? error.message
                        : "Unknown error",
            });
        }
    }

    return { persistedIds, failures };
}

// Captures the mailbox's historyId BEFORE listing messages, not
// after. If a new message arrives during/after this sync, its
// historyId will be greater than this baseline, so the next
// incremental sync (history.list(startHistoryId: baseline)) will
// still pick it up — nothing is skipped. The only cost is that a
// message processed in this initial batch may also be re-reported by
// the first incremental history.list call; upsertEmailFromGmail is
// idempotent (upsert on gmail_message_id), so that overlap is
// harmless.
export async function performInitialSync(
    gmail: gmail_v1.Gmail,
    connectionId: string,
    resynced: boolean
): Promise<SyncResult> {
    const profile = await gmail.users.getProfile({
        userId: "me",
    });

    const baselineHistoryId = profile.data.historyId;

    if (!baselineHistoryId) {
        throw new Error(
            "Gmail profile did not return a historyId"
        );
    }

    const listResponse = await gmail.users.messages.list({
        userId: "me",
        maxResults: INITIAL_SYNC_MAX_RESULTS,
    });

    const messageRefs = listResponse.data.messages ?? [];

    const { persistedIds, failures } = await processMessages(
        gmail,
        messageRefs.map((ref) => ref.id)
    );

    await updateLastHistoryId(connectionId, baselineHistoryId);

    return {
        success: failures.length === 0,
        mode: "initial",
        resynced,
        attempted: messageRefs.length,
        persisted: persistedIds.length,
        failed: failures.length,
        persistedMessageIds: persistedIds,
        failures,
        historyId: baselineHistoryId,
    };
}

export async function performIncrementalSync(
    gmail: gmail_v1.Gmail,
    connectionId: string,
    startHistoryId: string
): Promise<SyncResult> {
    const addedMessageIds = new Set<string>();

    let newHistoryId = startHistoryId;
    let pageToken: string | undefined;

    do {
        const historyResponse = await gmail.users.history.list({
            userId: "me",
            startHistoryId,
            historyTypes: ["messageAdded"],
            pageToken,
        });

        for (const record of historyResponse.data.history ??
            []) {
            for (const added of record.messagesAdded ?? []) {
                if (added.message?.id) {
                    addedMessageIds.add(added.message.id);
                }
            }
        }

        // Per the Gmail API's own documented guidance: once there is
        // no nextPageToken, the response's historyId is the correct
        // cursor to store for the next request.
        if (historyResponse.data.historyId) {
            newHistoryId = historyResponse.data.historyId;
        }

        pageToken =
            historyResponse.data.nextPageToken ?? undefined;
    } while (pageToken);

    const { persistedIds, failures } = await processMessages(
        gmail,
        [...addedMessageIds]
    );

    await updateLastHistoryId(connectionId, newHistoryId);

    return {
        success: failures.length === 0,
        mode: "incremental",
        resynced: false,
        attempted: addedMessageIds.size,
        persisted: persistedIds.length,
        failed: failures.length,
        persistedMessageIds: persistedIds,
        failures,
        historyId: newHistoryId,
    };
}

// Gmail returns HTTP 404 when startHistoryId is stale/invalid (the
// API only guarantees history for about a week). Checked defensively
// across the shapes googleapis/gaxios errors are known to take.
export function isStaleHistoryError(error: unknown): boolean {
    if (!error || typeof error !== "object") {
        return false;
    }

    const withStatus = error as {
        code?: number | string;
        status?: number | string;
        response?: { status?: number };
    };

    return (
        withStatus.response?.status === 404 ||
        withStatus.code === 404 ||
        withStatus.code === "404" ||
        withStatus.status === 404 ||
        withStatus.status === "404"
    );
}

// Single entry point used by BOTH /api/gmail/sync (manual trigger)
// and /api/gmail/webhook (Pub/Sub push trigger) so sync logic is
// never duplicated between them. Always uses the connection's STORED
// last_history_id as the cursor — callers must never substitute a
// historyId taken from a Pub/Sub notification payload (see
// app/api/gmail/webhook/route.ts for why).
export async function syncGmailConnection(
    gmail: gmail_v1.Gmail,
    connectionId: string,
    lastHistoryId: string | null
): Promise<SyncResult> {
    if (!lastHistoryId) {
        return performInitialSync(gmail, connectionId, false);
    }

    try {
        return await performIncrementalSync(
            gmail,
            connectionId,
            lastHistoryId
        );
    } catch (error) {
        if (isStaleHistoryError(error)) {
            console.error(
                "Gmail Sync - Stored historyId is stale/invalid, performing fresh initial sync:",
                connectionId
            );

            return performInitialSync(gmail, connectionId, true);
        }

        throw error;
    }
}
