import { supabase } from "@/lib/supabase";
import { PaymentEmailMatchResult } from "@/services/server/paymentEmailMatchingService";

function toDateOnlyString(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function buildProposedFacts(matchResult: PaymentEmailMatchResult) {
    if (matchResult.status === "ready") {
        return {
            customer_id: matchResult.customerId,
            invoice_id: matchResult.invoiceId,
            proposed_amount: matchResult.amount,
            proposed_currency: matchResult.currency,
            proposed_payment_date: toDateOnlyString(
                matchResult.paymentDate
            ),
            proposed_invoice_number: matchResult.invoiceNumber,
            proposed_payment_reference: matchResult.paymentReference,
            extraction_confidence: matchResult.confidence,
            needs_review_reason: null,
        };
    }

    return {
        customer_id: matchResult.customerId,
        invoice_id: matchResult.invoiceId,
        proposed_amount: matchResult.extracted?.amount ?? null,
        proposed_currency: matchResult.extracted?.currency ?? null,
        proposed_payment_date:
            matchResult.extracted?.paymentDate ?? null,
        proposed_invoice_number:
            matchResult.extracted?.invoiceNumber ?? null,
        proposed_payment_reference:
            matchResult.extracted?.paymentReference ?? null,
        extraction_confidence:
            matchResult.extracted?.confidence ?? null,
        needs_review_reason: matchResult.reason,
    };
}

// Lifecycle-safe: this function only ever creates a fresh proposal or
// refreshes an UNTOUCHED one. It never approves, executes, or touches
// payments/invoices/customers/emails, and it never overwrites a
// decision that has progressed beyond "pending/not_executed" — the
// authoritative human/system lifecycle state always wins over a
// reprocessed email.
export async function persistPaymentDecision(
    emailId: string,
    matchResult: PaymentEmailMatchResult
) {
    const { data: existing, error: selectError } = await supabase
        .from("payment_decisions")
        .select("*")
        .eq("email_id", emailId)
        .maybeSingle();

    if (selectError) throw selectError;

    const proposedFacts = buildProposedFacts(matchResult);

    // CASE 1 — no existing row: create a fresh, untouched proposal.
    if (!existing) {
        const { data, error } = await supabase
            .from("payment_decisions")
            .insert({
                email_id: emailId,

                ...proposedFacts,

                // Structured, complete snapshot of what the matcher
                // returned, for a future review UI. Typed columns
                // above are populated independently — this is not
                // the only place the queryable facts live.
                match_evidence: matchResult,

                status: "pending",
                execution_status: "not_executed",
                payment_id: null,
                approved_at: null,
                rejected_at: null,
                executed_at: null,
                execution_error: null,
            })
            .select()
            .single();

        if (error) throw error;

        return data;
    }

    // CASE 3 — the decision has progressed beyond an untouched
    // proposal (approved, rejected, executing, executed, or
    // execution_failed). The authoritative lifecycle state wins:
    // return it exactly as-is, no write at all.
    const isUntouchedProposal =
        existing.status === "pending" &&
        existing.execution_status === "not_executed";

    if (!isUntouchedProposal) {
        return existing;
    }

    // CASE 2 — still an untouched proposal: safe to refresh the
    // proposed facts/evidence with the latest matchResult, while
    // explicitly re-affirming (not just relying on "unchanged") that
    // it stays pending/not_executed with no lifecycle progression.
    const { data, error } = await supabase
        .from("payment_decisions")
        .update({
            ...proposedFacts,

            match_evidence: matchResult,

            status: "pending",
            execution_status: "not_executed",
            payment_id: null,
            approved_at: null,
            rejected_at: null,
            executed_at: null,
            execution_error: null,

            updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single();

    if (error) throw error;

    return data;
}
