-- Extends activity_log.activity_type's CHECK constraint with a single new
-- value so the "24h wait completed" flow (services/server/
-- paymentDecisionService.ts::logWaitCompletedForResurfacedDecisions(),
-- called from getPendingPaymentDecisions()) can record its outcome in
-- Activity:
--
--   payment_decision_wait_completed — the SYSTEM resurfacing a deferred
--                                      payment_decision after its 24-hour
--                                      wait elapsed with no payment proof
--                                      received. Distinct from the
--                                      existing payment_decision_deferred
--                                      (the human's WAIT click that
--                                      started the clock): that event
--                                      represents the decision, this one
--                                      represents the system detecting no
--                                      confirmation arrived. Sends no
--                                      email, creates no payment, never
--                                      touches payment_decisions itself.
--                                      Logged at most once per WAIT cycle
--                                      (keyed by decisionId + the
--                                      deferred_at value that started
--                                      that cycle) — detected at read
--                                      time (no cron/poller), guarded by
--                                      a lookup against existing Activity
--                                      Feed rows so a dashboard refresh
--                                      never re-logs it.
--
-- Inspected the CURRENT constraint (added by
-- 20260814120000_add_payment_decision_deferred_activity_type.sql) before
-- writing this migration. All 19 existing allowed values are preserved
-- verbatim, unchanged, in the same order — this migration adds exactly
-- one value and does not otherwise redesign the constraint.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before wait-completed activity logging will
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
        'payment_decision_wait_completed'::text
    ]));
