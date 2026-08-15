-- Responsibility #7 (Handle Disputes / Blockers / Exceptions) — extends
-- activity_log.activity_type's CHECK constraint with the 2 values the
-- new exception-revision handling needs, so a repeated dispute/blocker
-- report is reconstructable from Activity as an UPDATE to an existing
-- exception, not indistinguishable from (or silently absent next to) the
-- original opening event. Same discipline as
-- 20260819130000_add_promise_lifecycle_activity_types.sql for
-- Responsibility #6's promise revisions:
--
--   collection_dispute_revised  — a NEW dispute report arrived while a
--                                  dispute was already open (same
--                                  category) — the prior report's exact
--                                  {type, detail, confidence, openedAt}
--                                  is preserved in this row's metadata
--                                  (previousException); exception_opened_at
--                                  on the case itself is left untouched.
--                                  Also covers a dispute superseding an
--                                  already-open BLOCKER (a genuine
--                                  category change) — see
--                                  collectionDecisionEngine.ts's T6
--                                  branch for exactly when
--                                  wasRevision=true vs. a fresh
--                                  collection_dispute_opened.
--   collection_blocker_revised  — a NEW blocker report arrived while a
--                                  blocker was already open. A blocker
--                                  can never supersede an open dispute
--                                  (dispute precedence, unchanged from
--                                  Responsibility #3/#4), so this is
--                                  always a same-category update, never
--                                  a category change.
--
-- Inspected the CURRENT constraint (added by
-- 20260819130000_add_promise_lifecycle_activity_types.sql, verified
-- directly against that file's own CHECK array rather than assumed)
-- before writing this migration. All 35 existing allowed values are
-- preserved verbatim, unchanged, in the same order — this migration
-- adds exactly 2 new values.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before exception-revision activity logging will
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
        'collection_promise_revised'::text,
        'collection_dispute_revised'::text,
        'collection_blocker_revised'::text
    ]));
