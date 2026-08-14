// Responsibility #3 (Collections & Follow-Up) — deterministic, non-AI-
// generated composers, following the exact same architecture as the
// existing services/server/paymentProofEmailComposer.ts: plain string
// templates, no LLM call. Hard business decisions (what to say, when)
// are made entirely by collectionDecisionEngine.ts; these functions
// only ever phrase a decision that has already been made, from facts
// supplied by the caller — never something they are asked to "figure
// out" themselves.
//
// Kept in one file (rather than five) because all five share the same
// tiny amount of formatting/subject-building scaffolding — mirrors how
// this codebase already keeps small, closely-related formatters
// together rather than one file per function.

export interface ComposedEmail {
    subject: string;
    body: string;
}

function formatCurrency(amount: number, currency: string): string {
    const locale = currency === "INR" ? "en-IN" : "en-US";

    return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(amount);
}

function toReplySubject(originalSubject: string | null, fallback: string): string {
    const trimmed = originalSubject?.trim();

    if (!trimmed) return `Re: ${fallback}`;

    return /^re:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

// -----------------------------------------------------------------
// Proactive outreach (contact / follow_up / check_in) — fresh emails,
// not replies. The approved v2 schema does not persist a thread id for
// the case's own outbound conversation, so each proactive message is
// its own thread; see the Phase 3 implementation report for this known
// v1 limitation.
// -----------------------------------------------------------------

export interface ExposureSummary {
    outstandingAmount: number;
    overdueAmount: number;
    overdueInvoiceCount: number;
    maxDaysOverdue: number;
    currency: string;
}

function describeExposure(exposure: ExposureSummary): string {
    return `${formatCurrency(exposure.overdueAmount, exposure.currency)} overdue across ${exposure.overdueInvoiceCount} invoice${exposure.overdueInvoiceCount === 1 ? "" : "s"}, up to ${exposure.maxDaysOverdue} day${exposure.maxDaysOverdue === 1 ? "" : "s"} overdue`;
}

export interface InitialContactInput {
    customerName: string;
    exposure: ExposureSummary;
}

// First-ever outreach for this case (T2, decision="contact"). Gentlest
// available tone — assumes good faith, never implies the customer is
// at fault.
export function composeInitialContactEmail(
    input: InitialContactInput
): ComposedEmail {
    const subject = "Outstanding balance on your account";

    const body = `Hi ${input.customerName},

I hope you're doing well.

I wanted to flag that ${describeExposure(input.exposure)}.

If payment is already on its way, please disregard this note — otherwise, could you let us know when we can expect it, or if there's anything blocking it on your end?

Thank you.`;

    return { subject, body };
}

export interface FollowUpInput {
    customerName: string;
    exposure: ExposureSummary;
    missedCommitment: {
        amount: number | null;
        currency: string | null;
        date: string;
    } | null;
}

// Follow-up after silence (T14) or a missed promise (T19). Tone
// references what actually happened — never a generic restart of the
// conversation.
export function composeFollowUpEmail(input: FollowUpInput): ComposedEmail {
    const subject = "Following up — outstanding balance";

    const commitmentLine = input.missedCommitment
        ? input.missedCommitment.amount !== null &&
          input.missedCommitment.currency
            ? `We hadn't seen payment of ${formatCurrency(input.missedCommitment.amount, input.missedCommitment.currency)} by ${input.missedCommitment.date} as discussed — `
            : `We hadn't seen payment by ${input.missedCommitment.date} as discussed — `
        : "I wanted to follow up on my previous note — ";

    const body = `Hi ${input.customerName},

${commitmentLine}${describeExposure(input.exposure)}.

Could you let us know the current status, or share a revised timeline for payment?

Thank you.`;

    return { subject, body };
}

export interface BlockerCheckInInput {
    customerName: string;
    exceptionDetail: string | null;
}

// A blocker check-in (T10). Deliberately framed as help, never as
// pressure — the customer already told us they intend to pay and are
// stuck internally.
export function composeBlockerCheckInEmail(
    input: BlockerCheckInInput
): ComposedEmail {
    const subject = "Checking in on your account";

    const contextLine = input.exceptionDetail
        ? `Last we heard, ${input.exceptionDetail.charAt(0).toLowerCase()}${input.exceptionDetail.slice(1)} `
        : "";

    const body = `Hi ${input.customerName},

Just checking in — ${contextLine}is there anything we can do to help move things along on our end (e.g. resending documentation, providing a corrected invoice)?

No rush if this is still in progress — just let us know if there's an updated timeline.

Thank you.`;

    return { subject, body };
}

// -----------------------------------------------------------------
// Reply-triggered acknowledgments (acknowledge_promise /
// acknowledge_exception) — same-thread replies to the specific
// customer email that caused them, following the exact same
// threading pattern as paymentProofRequestService.ts (RFC Message-ID
// In-Reply-To/References, resolved by the orchestration layer before
// calling sendGmailReply()).
// -----------------------------------------------------------------

export interface PromiseAcknowledgmentInput {
    customerName: string;
    amount: number | null;
    currency: string | null;
    date: string;
    originalSubject: string | null;
}

// Confirms receipt of a commitment and sets a plain mutual expectation.
// Never adds pressure or a warning — the case pauses entirely until the
// date (or a broken-promise follow-up, handled separately).
export function composePromiseAcknowledgmentEmail(
    input: PromiseAcknowledgmentInput
): ComposedEmail {
    const subject = toReplySubject(
        input.originalSubject,
        "Outstanding balance on your account"
    );

    const amountLine =
        input.amount !== null && input.currency
            ? `you'll settle ${formatCurrency(input.amount, input.currency)} by ${input.date}`
            : `you'll settle this by ${input.date}`;

    const body = `Hi ${input.customerName},

Thanks for confirming — noting that ${amountLine}.

We'll follow up only if we haven't seen it by then.

Thank you.`;

    return { subject, body };
}

export interface DisputeAcknowledgmentInput {
    customerName: string;
    originalSubject: string | null;
}

// Deliberately does not admit fault, does not re-assert the amount
// owed, and does not claim the dispute is valid or invalid — only that
// it has been received and will be looked into by a person.
export function composeDisputeAcknowledgmentEmail(
    input: DisputeAcknowledgmentInput
): ComposedEmail {
    const subject = toReplySubject(
        input.originalSubject,
        "Outstanding balance on your account"
    );

    const body = `Hi ${input.customerName},

Thank you for letting us know. We've received your note and a member of our team will follow up with you directly to look into it.

We won't send any further payment reminders on this while it's being reviewed.

Thank you for your patience.`;

    return { subject, body };
}
