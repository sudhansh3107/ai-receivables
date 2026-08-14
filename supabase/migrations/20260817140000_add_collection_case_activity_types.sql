-- Extends activity_log.activity_type's CHECK constraint with the 11
-- values Responsibility #3 (Collections & Follow-Up) needs, so every
-- collection-case transition/action is reconstructable from Activity
-- alone (same discipline as receivables_assessment_updated for #2):
--
--   collection_case_opened            — a case was opened for a customer
--                                        (services/server/
--                                        collectionCaseService.ts::
--                                        openCollectionCase())
--   collection_outreach_sent          — contact/follow_up/check_in sent;
--                                        the specific decision label is
--                                        in metadata
--   collection_promise_acknowledged   — a payment_promise was accepted
--                                        and acknowledged
--   collection_promise_recorded       — promise_* fields were written
--   collection_promise_broken         — a promise's date passed unmet
--   collection_dispute_opened         — customer disputed the debt
--   collection_blocker_opened         — customer reported an
--                                        administrative blocker
--   collection_exception_resolved     — an active dispute/blocker was
--                                        cleared
--   collection_case_escalated         — the canonical escalation gate
--                                        was satisfied; human review
--                                        requested
--   collection_case_resolved          — case reached a terminal state
--   collection_case_resumed_by_human  — a human resumed an escalated
--                                        case
--
-- Inspected the CURRENT constraint (added by
-- 20260816130000_add_receivables_assessment_activity_type.sql, verified
-- directly against that file's own CHECK array rather than assumed) before
-- writing this migration. All 21 existing allowed values are preserved
-- verbatim, unchanged, in the same order — this migration adds exactly
-- 11 new values in one batch (a deliberate, documented deviation from
-- the strict one-value-per-migration precedent used for every prior
-- single-value addition: these 11 all ship together as one feature,
-- unlike each of the prior additions which shipped as separate,
-- unrelated features) and does not otherwise redesign the constraint.
--
-- NOTE (pre-existing, unrelated to this migration, not fixed here):
-- lib/activityTypes.ts also defines PAYMENT_CLAIM_RECEIVED
-- ("payment_claim_received") and PAYMENT_CLAIM_MATCHED
-- ("payment_claim_matched"), used by services/server/
-- emailProcessingService.ts, but NEITHER value has ever been added to
-- this CHECK constraint by any prior migration — confirmed by searching
-- every migration in this directory. Those logActivity() calls are each
-- wrapped in their own try/catch at the call site, so this has been
-- failing silently rather than breaking anything; out of scope for
-- Responsibility #3 to fix, and deliberately NOT added here to avoid
-- silently expanding this migration beyond what it was asked to do.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before collection-case activity logging will
-- function against a real database.

ALTER TABLE public.activity_log
    DROP CONSTRAINT IF EXISTS activity_log_activity_type_check;

ALTER TABLE public.activity_log
    ADD CONSTRAINT activity_log_activity_type_check
    CHECK (activity_type = ANY (ARRAY[
        'invoice_created'::text,
        'invoice_validated'::text,
        'invoice_uploaded'::text,
        'invoice_confidence_calculated'::text,
        'customer_created'::text,
        'customer_matched'::text,
        'reminder_scheduled'::text,
        'reminder_sent'::text,
        'payment_recorded'::text,
        'invoice_paid'::text,
        'invoice_partially_paid'::text,
        'invoice_overdue'::text,
        'customer_insights_updated'::text,
        'payment_decision_approved'::text,
        'payment_decision_executed'::text,
        'payment_decision_execution_failed'::text,
        'payment_proof_requested'::text,
        'payment_decision_resolved'::text,
        'payment_decision_deferred'::text,
        'payment_decision_wait_completed'::text,
        'receivables_assessment_updated'::text,
        'collection_case_opened'::text,
        'collection_outreach_sent'::text,
        'collection_promise_acknowledged'::text,
        'collection_promise_recorded'::text,
        'collection_promise_broken'::text,
        'collection_dispute_opened'::text,
        'collection_blocker_opened'::text,
        'collection_exception_resolved'::text,
        'collection_case_escalated'::text,
        'collection_case_resolved'::text,
        'collection_case_resumed_by_human'::text
    ]));
