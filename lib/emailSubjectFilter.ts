// Deterministic pre-persistence subject filter — runs BEFORE a Gmail
// message is ever persisted to `emails` (services/server/
// gmailSyncService.ts::processMessages()), so obviously system-
// generated mail never reaches the AR relevance gate or costs an LLM
// classification call.
//
// Deliberately narrow: only exact/near-exact prefix matches on
// well-known, machine-generated subject conventions (calendar
// responses/invites, auto-replies, bounce notifications). Never
// attempts to detect marketing/newsletter/promotional mail by subject
// text alone — legitimate AR subjects are too variable and that risk
// is explicitly out of scope here; sender-domain and body-based
// detection of that category remains the AR relevance gate's job
// (lib/emailRelevanceGate.ts), which has signals subject text alone
// can't safely provide.
//
// If uncertain, returns false (PASS) — there is no "maybe
// system-generated" outcome.

const SYSTEM_GENERATED_SUBJECT_PREFIXES = [
    // Calendar
    "accepted:",
    "declined:",
    "tentative:",
    "canceled event:",
    "invitation:",

    // Auto-reply
    "automatic reply:",
    "out of office:",
    "autoreply:",
    "away from office:",

    // Bounce / delivery failure
    "undelivered mail returned to sender",
    "delivery status notification",
    "mail delivery failed",
];

export function isSystemGeneratedSubject(
    subject: string | null
): boolean {
    if (!subject) return false;

    const normalized = subject.trim().toLowerCase();

    return SYSTEM_GENERATED_SUBJECT_PREFIXES.some((prefix) =>
        normalized.startsWith(prefix)
    );
}
