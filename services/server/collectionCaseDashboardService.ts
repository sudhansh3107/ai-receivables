import { supabase } from "@/lib/supabase";
import { ActivityTypes } from "@/lib/activityTypes";
import type { CaseStatus } from "./collectionDecisionEngine";

// ---------------------------------------------------------------------
// Responsibility #4 (Collection Outreach) — read-only display layer for
// the /collections UI. No decision logic, no writes: every field here
// is either a direct column off public.collection_cases or a derived
// view of activity_log/emails already written by
// collectionCaseOrchestrationService.ts. Mirrors decisionService.ts's
// existing "read live, never duplicate" discipline for #1/#2 data.
// ---------------------------------------------------------------------

export interface CollectionCaseSummary {
    id: string;
    customerId: string;
    customerName: string;
    status: CaseStatus;
    openedAt: string;
    closedAt: string | null;
    closedReason: string | null;
    lastDecision: string | null;
    lastDecisionReason: string | null;
    lastActionAt: string | null;
    nextEvaluationAt: string;
    outreachCount: number;
    unansweredOutreachCount: number;
    lastOutreachAt: string | null;
    brokenPromiseCount: number;
    promiseStatus: string | null;
    promiseDate: string | null;
    exceptionCategory: string | null;
    exceptionStatus: string | null;
    escalatedAt: string | null;
    updatedAt: string;
}

interface CollectionCaseSummaryRow {
    id: string;
    customer_id: string;
    status: CaseStatus;
    opened_at: string;
    closed_at: string | null;
    closed_reason: string | null;
    last_decision: string | null;
    last_decision_reason: string | null;
    last_action_at: string | null;
    next_evaluation_at: string;
    outreach_count: number;
    unanswered_outreach_count: number;
    last_outreach_at: string | null;
    broken_promise_count: number;
    promise_status: string | null;
    promise_date: string | null;
    exception_category: string | null;
    exception_status: string | null;
    escalated_at: string | null;
    updated_at: string;
    customers: { company_name: string } | null;
}

function toSummary(row: CollectionCaseSummaryRow): CollectionCaseSummary {
    return {
        id: row.id,
        customerId: row.customer_id,
        customerName: row.customers?.company_name ?? "Unknown customer",
        status: row.status,
        openedAt: row.opened_at,
        closedAt: row.closed_at,
        closedReason: row.closed_reason,
        lastDecision: row.last_decision,
        lastDecisionReason: row.last_decision_reason,
        lastActionAt: row.last_action_at,
        nextEvaluationAt: row.next_evaluation_at,
        outreachCount: row.outreach_count,
        unansweredOutreachCount: row.unanswered_outreach_count,
        lastOutreachAt: row.last_outreach_at,
        brokenPromiseCount: row.broken_promise_count,
        promiseStatus: row.promise_status,
        promiseDate: row.promise_date,
        exceptionCategory: row.exception_category,
        exceptionStatus: row.exception_status,
        escalatedAt: row.escalated_at,
        updatedAt: row.updated_at,
    };
}

// Scalar columns only, no embed — getCollectionCaseDetail() below needs
// a WIDER customers(...) embed than the list view, and PostgREST
// rejects a select string that embeds the same relation twice. Each
// query appends its own single customers(...) embed on top of this
// base instead of composing two.
const SUMMARY_SCALAR_COLUMNS = `
    id, customer_id, status, opened_at, closed_at, closed_reason,
    last_decision, last_decision_reason, last_action_at, next_evaluation_at,
    outreach_count, unanswered_outreach_count, last_outreach_at,
    broken_promise_count, promise_status, promise_date,
    exception_category, exception_status, escalated_at, updated_at
`;

const SUMMARY_COLUMNS = `${SUMMARY_SCALAR_COLUMNS}, customers ( company_name )`;

// Every case, any status — the full work-state view (unlike
// getEscalatedCollectionCases(), which exists purely to feed the
// decision queue and only ever returns status='escalated'). `limit` is
// an MVP safety cap on the query, not a claim of unlimited history, same
// convention as activityLogService.ts::getActivityHistory().
export async function getCollectionCaseList(
    limit = 100
): Promise<CollectionCaseSummary[]> {
    const { data, error } = await supabase
        .from("collection_cases")
        .select(SUMMARY_COLUMNS)
        .order("updated_at", { ascending: false })
        .limit(limit);

    if (error) throw error;

    return (data ?? []).map((row) =>
        toSummary(row as unknown as CollectionCaseSummaryRow)
    );
}

export interface CommunicationEntry {
    id: string;
    timestamp: string;
    direction: "outbound" | "inbound";
    subject: string | null;
    body: string | null;
    // Set for outbound entries — the exact collection_* activity_type
    // this row was logged under (see collectionCaseOrchestrationService.ts).
    activityType?: string;
    // Set for inbound entries — the classification emailClassificationService.ts
    // assigned (see lib/emailClassification.ts).
    classification?: string | null;
}

export interface CollectionCaseDetail extends CollectionCaseSummary {
    customerEmail: string | null;
    triggeringInvoiceId: string | null;
    triggeringInvoiceNumber: string | null;
    promiseAmount: number | null;
    promiseCurrency: string | null;
    exceptionType: string | null;
    exceptionDetail: string | null;
    // Responsibility #7 — surfaced for parity with the underlying data
    // (mirrors promise_confidence's own column, which is likewise
    // fetched but not yet rendered anywhere in the UI); not wired into
    // app/collections/[id]/page.tsx, matching that existing precedent
    // rather than adding a new display element for one field.
    exceptionConfidence: number | null;
    escalationReason: string | null;
    communicationHistory: CommunicationEntry[];
}

interface CollectionCaseDetailRow extends CollectionCaseSummaryRow {
    customers: {
        company_name: string;
        contact_name: string | null;
        email: string | null;
    } | null;
    triggering_invoice_id: string | null;
    promise_amount: number | string | null;
    promise_currency: string | null;
    exception_type: string | null;
    exception_detail: string | null;
    exception_confidence: number | string | null;
    escalation_reason: string | null;
    invoices: { invoice_number: string } | null;
}

interface OutboundActivityMetadata {
    caseId?: string;
    subject?: string;
    body?: string;
}

// Every collection_* activity_type the orchestration layer actually
// writes (lib/activityTypes.ts's COLLECTION_PROMISE_RECORDED is
// deliberately excluded — never fired, see
// collectionCaseOrchestrationService.ts's selectOutreachActivityType()
// header for why COLLECTION_PROMISE_ACKNOWLEDGED already covers that
// moment).
const COLLECTION_ACTIVITY_TYPES: string[] = [
    ActivityTypes.COLLECTION_CASE_OPENED,
    ActivityTypes.COLLECTION_OUTREACH_SENT,
    ActivityTypes.COLLECTION_PROMISE_ACKNOWLEDGED,
    ActivityTypes.COLLECTION_PROMISE_BROKEN,
    // Responsibility #6 (Manage Promises to Pay).
    ActivityTypes.COLLECTION_PROMISE_FULFILLED,
    ActivityTypes.COLLECTION_PROMISE_PARTIALLY_FULFILLED,
    ActivityTypes.COLLECTION_PROMISE_REVISED,
    ActivityTypes.COLLECTION_DISPUTE_OPENED,
    ActivityTypes.COLLECTION_BLOCKER_OPENED,
    // Responsibility #7 (Handle Disputes / Blockers / Exceptions).
    ActivityTypes.COLLECTION_DISPUTE_REVISED,
    ActivityTypes.COLLECTION_BLOCKER_REVISED,
    ActivityTypes.COLLECTION_EXCEPTION_RESOLVED,
    ActivityTypes.COLLECTION_CASE_ESCALATED,
    ActivityTypes.COLLECTION_CASE_RESOLVED,
    ActivityTypes.COLLECTION_CASE_RESUMED_BY_HUMAN,
];

// Single-case detail: case fields + a merged, chronological
// communication history. The outbound side comes from activity_log
// (composed subject/body persisted in metadata at send time — see
// logOutreachActivity()); the inbound side comes from public.emails by
// customer_id (no direct case_id FK exists on emails — see
// 20260817130000_add_emails_customer_id.sql's own header for why — so
// this is a best-effort time-window join: every inbound email for this
// customer received on/after the case opened, which is exact for a
// customer's first case and a close approximation once a customer has
// accumulated more than one historical case).
export async function getCollectionCaseDetail(
    caseId: string
): Promise<CollectionCaseDetail | null> {
    const { data: row, error } = await supabase
        .from("collection_cases")
        .select(
            `
            ${SUMMARY_SCALAR_COLUMNS},
            triggering_invoice_id,
            promise_amount, promise_currency,
            exception_type, exception_detail, exception_confidence, escalation_reason,
            customers ( company_name, contact_name, email ),
            invoices ( invoice_number )
        `
        )
        .eq("id", caseId)
        .maybeSingle();

    if (error) throw error;
    if (!row) return null;

    const detailRow = row as unknown as CollectionCaseDetailRow;

    const [activityResult, emailResult] = await Promise.all([
        supabase
            .from("activity_log")
            .select("id, activity_type, description, metadata, created_at")
            .eq("customer_id", detailRow.customer_id)
            .in("activity_type", COLLECTION_ACTIVITY_TYPES)
            .order("created_at", { ascending: true }),
        supabase
            .from("emails")
            .select("id, subject, text_body, received_at, classification")
            .eq("customer_id", detailRow.customer_id)
            .gte("received_at", detailRow.opened_at)
            .order("received_at", { ascending: true }),
    ]);

    if (activityResult.error) throw activityResult.error;
    if (emailResult.error) throw emailResult.error;

    // Coarse pre-filter above is by customer_id only; a customer can
    // accumulate multiple cases over time (collection_cases.customer_id
    // is deliberately not unique — see that migration's header), so
    // metadata.caseId is the real per-case scope for activity_log rows.
    const caseActivity = (activityResult.data ?? []).filter((activity) => {
        const metadata = activity.metadata as OutboundActivityMetadata | null;
        return metadata?.caseId === caseId;
    });

    const outboundEntries: CommunicationEntry[] = caseActivity.map(
        (activity) => {
            const metadata = activity.metadata as OutboundActivityMetadata | null;

            return {
                id: activity.id,
                timestamp: activity.created_at,
                direction: "outbound" as const,
                subject: metadata?.subject ?? null,
                // Falls back to the logged reason for lifecycle events
                // that never sent an email (case opened/escalated/
                // resolved/blocker opened/exception resolved/resumed) —
                // those rows never have a composed subject/body.
                body: metadata?.body ?? activity.description,
                activityType: activity.activity_type,
            };
        }
    );

    const inboundEntries: CommunicationEntry[] = (emailResult.data ?? []).map(
        (email) => ({
            id: email.id,
            timestamp: email.received_at,
            direction: "inbound" as const,
            subject: email.subject,
            body: email.text_body,
            classification: email.classification,
        })
    );

    const communicationHistory = [...outboundEntries, ...inboundEntries].sort(
        (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
        ...toSummary(detailRow),
        customerEmail: detailRow.customers?.email ?? null,
        triggeringInvoiceId: detailRow.triggering_invoice_id,
        triggeringInvoiceNumber: detailRow.invoices?.invoice_number ?? null,
        promiseAmount:
            detailRow.promise_amount === null
                ? null
                : Number(detailRow.promise_amount),
        promiseCurrency: detailRow.promise_currency,
        exceptionType: detailRow.exception_type,
        exceptionDetail: detailRow.exception_detail,
        exceptionConfidence:
            detailRow.exception_confidence == null
                ? null
                : Number(detailRow.exception_confidence),
        escalationReason: detailRow.escalation_reason,
        communicationHistory,
    };
}
