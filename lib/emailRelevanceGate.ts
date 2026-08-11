// AR Relevance Gate — runs BEFORE classifyEmail() (services/server/
// emailClassificationService.ts) so obviously irrelevant mail never
// costs an LLM call. Deliberately conservative and deterministic-only:
// it may only decide "not relevant" when a rule is confident (a
// well-known bulk-mail/recruiting domain, or an unambiguous bulk-mail
// footer phrase). Anything not confidently matched PASSES through to
// classification — there is no "maybe irrelevant" outcome here, per
// the "if uncertain, PASS" rule this gate was built against.
//
// Note: sender domains alone are NEVER used to reject on the basis of
// being automated/no-reply — payment/remittance confirmations are
// legitimately AR-relevant and are very often sent from automated
// no-reply addresses (payment gateways, banks, ERPs). Only domains
// that are unambiguously marketing/ESP or recruiting/job-board
// platforms are listed below.

export interface EmailRelevanceInput {
    fromEmail: string;
    subject: string | null;
    textBody: string | null;
}

export interface EmailRelevanceResult {
    relevant: boolean;
    reason: string;
}

const MARKETING_SENDER_DOMAINS = new Set([
    "mailchimp.com",
    "list-manage.com",
    "campaign-archive.com",
    "sendgrid.net",
    "hubspotemail.net",
    "klaviyomail.com",
    "mailerlite.com",
    "constantcontact.com",
    "sendinblue.com",
    "getresponse.com",
    "substack.com",
    "mailgun.org",
]);

const RECRUITING_SENDER_DOMAINS = new Set([
    "linkedin.com",
    "indeed.com",
    "greenhouse.io",
    "lever.co",
    "myworkday.com",
    "ziprecruiter.com",
    "glassdoor.com",
    "ashbyhq.com",
]);

// Compound phrases, not a bare "unsubscribe" — real AR correspondence
// (payment confirmations, invoice disputes, negotiations, etc.)
// essentially never contains these exact bulk-mail footer patterns, so
// false positives here are very unlikely.
const BULK_MAIL_FOOTER_PATTERNS = [
    /unsubscribe from (this|these) (email|list)/i,
    /you('| a)re receiving this (email|newsletter) because/i,
    /manage your (email )?preferences/i,
    /view (this|in) (email )?(in your )?browser/i,
    /update your (email )?subscription preferences/i,
];

function extractSenderDomain(fromEmail: string): string | null {
    const match = fromEmail.match(/@([^\s>]+)/);
    return match ? match[1].toLowerCase() : null;
}

export function evaluateEmailRelevance(
    input: EmailRelevanceInput
): EmailRelevanceResult {
    const domain = extractSenderDomain(input.fromEmail);

    if (domain && MARKETING_SENDER_DOMAINS.has(domain)) {
        return {
            relevant: false,
            reason: `sender domain "${domain}" is a known marketing/ESP domain`,
        };
    }

    if (domain && RECRUITING_SENDER_DOMAINS.has(domain)) {
        return {
            relevant: false,
            reason: `sender domain "${domain}" is a known recruiting/job-board domain`,
        };
    }

    const body = input.textBody ?? "";

    for (const pattern of BULK_MAIL_FOOTER_PATTERNS) {
        if (pattern.test(body)) {
            return {
                relevant: false,
                reason: "email body matches a bulk-mail footer pattern",
            };
        }
    }

    return {
        relevant: true,
        reason: "no confident irrelevance signal matched",
    };
}
