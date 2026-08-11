-- Extends activity_log.activity_type's CHECK constraint with a single new
-- value so the Wait flow (services/server/paymentDecisionExecutionService.ts::
-- deferPaymentDecision()) can record its outcome in Activity:
--
--   payment_decision_deferred — a human chose "Wait" on a pending
--                                payment_decision. NOT an approval — sends
--                                no email, creates no payment. Only sets
--                                deferred_at so getPendingPaymentDecisions()
--                                hides the decision from the queue for 24
--                                hours; it reappears automatically once
--                                deferred_at is more than 24 hours old
--                                (query-time filter — no cron/poller).
--
-- Inspected the CURRENT constraint (added by
-- 20260813120000_add_payment_decision_resolved_activity_type.sql) before
-- writing this migration. All 18 existing allowed values are preserved
-- verbatim, unchanged, in the same order — this migration adds exactly
-- one value and does not otherwise redesign the constraint.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before Wait activity logging will function against
-- a real database.

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
        'payment_decision_deferred'::text
    ]));
