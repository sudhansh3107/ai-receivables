-- Responsibility #6 (Manage Promises to Pay) — extends
-- activity_log.activity_type's CHECK constraint with the 3 values the
-- new promise-fulfilment lifecycle needs, so every promise state
-- transition is reconstructable from Activity alone (same discipline as
-- 20260817140000_add_collection_case_activity_types.sql for
-- Responsibility #3):
--
--   collection_promise_fulfilled            — a promise's full amount
--                                              was paid down (judged
--                                              against #2's live
--                                              outstanding-balance
--                                              truth, never the
--                                              customer's own claim)
--   collection_promise_partially_fulfilled  — the promise's grace
--                                              window expired with SOME
--                                              but not all of the
--                                              promised amount paid
--   collection_promise_revised              — a new payment_promise
--                                              overwrote an already-
--                                              active (unexpired)
--                                              promise; the prior
--                                              commitment's exact
--                                              figures are preserved in
--                                              this row's metadata
--                                              (previousPromise)
--
-- Inspected the CURRENT constraint (added by
-- 20260817140000_add_collection_case_activity_types.sql, verified
-- directly against that file's own CHECK array rather than assumed)
-- before writing this migration. All 32 existing allowed values are
-- preserved verbatim, unchanged, in the same order — this migration
-- adds exactly 3 new values.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before promise-lifecycle activity logging will
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
        'collection_case_resumed_by_human'::text,
        'collection_promise_fulfilled'::text,
        'collection_promise_partially_fulfilled'::text,
        'collection_promise_revised'::text
    ]));
