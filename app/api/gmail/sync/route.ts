import { NextResponse } from "next/server";
import { gmail_v1 } from "googleapis";
import { getGmailClientForConnection } from "@/lib/google";
import { parseGmailMessage } from "@/lib/gmail/parse-email";
import { upsertEmailFromGmail } from "@/services/server/emailService";
import {
    getPrimaryGmailConnection,
    getDecryptedRefreshToken,
    updateLastHistoryId,
} from "@/services/server/gmailConnectionService";

const INITIAL_SYNC_MAX_RESULTS = 10;

interface SyncFailure {
    messageId: string | null | undefined;
    error: string;
}

interface MessageProcessingResult {
    persistedIds: string[];
    failures: SyncFailure[];
}

// Shared persistence tail for both the initial and incremental sync
// paths: message ID -> messages.get() -> parseGmailMessage() ->
// upsertEmailFromGmail(). One message's failure never stops the rest
// of the batch (matches the failure isolation of the original
// implementation).
async function processMessages(
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
async function performInitialSync(
    gmail: gmail_v1.Gmail,
    connectionId: string,
    resynced: boolean
) {
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

    return NextResponse.json({
        success: failures.length === 0,
        mode: "initial",
        resynced,
        attempted: messageRefs.length,
        persisted: persistedIds.length,
        failed: failures.length,
        persistedMessageIds: persistedIds,
        failures,
        historyId: baselineHistoryId,
    });
}

async function performIncrementalSync(
    gmail: gmail_v1.Gmail,
    connectionId: string,
    startHistoryId: string
) {
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

    return NextResponse.json({
        success: failures.length === 0,
        mode: "incremental",
        resynced: false,
        attempted: addedMessageIds.size,
        persisted: persistedIds.length,
        failed: failures.length,
        persistedMessageIds: persistedIds,
        failures,
        historyId: newHistoryId,
    });
}

// Gmail returns HTTP 404 when startHistoryId is stale/invalid (the
// API only guarantees history for about a week). Checked defensively
// across the shapes googleapis/gaxios errors are known to take.
function isStaleHistoryError(error: unknown): boolean {
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

export async function POST() {
    try {
        const connection = await getPrimaryGmailConnection();

        if (!connection) {
            return NextResponse.json(
                {
                    error:
                        "No durable Gmail connection found. Connect Gmail first.",
                },
                { status: 401 }
            );
        }

        const refreshToken = await getDecryptedRefreshToken(
            connection.id
        );

        const gmail = getGmailClientForConnection(
            connection.id,
            refreshToken
        );

        if (!connection.lastHistoryId) {
            return await performInitialSync(
                gmail,
                connection.id,
                false
            );
        }

        try {
            return await performIncrementalSync(
                gmail,
                connection.id,
                connection.lastHistoryId
            );
        } catch (error) {
            if (isStaleHistoryError(error)) {
                console.error(
                    "Gmail Sync - Stored historyId is stale/invalid, performing fresh initial sync:",
                    connection.id
                );

                return await performInitialSync(
                    gmail,
                    connection.id,
                    true
                );
            }

            throw error;
        }
    } catch (error) {
        console.error("Gmail Sync Error:", error);

        return NextResponse.json(
            {
                error: "Failed to sync Gmail messages",
            },
            { status: 500 }
        );
    }
}
