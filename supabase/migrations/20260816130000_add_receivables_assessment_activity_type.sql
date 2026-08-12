-- Extends activity_log.activity_type's CHECK constraint with a single new
-- value so Responsibility #2 (Monitor Outstanding Receivables — see
-- services/server/receivablesMonitoringService.ts::refreshReceivablesAssessment())
-- can record its work in Activity, per the same pattern
-- customer_insights_updated already established for Responsibility #1:
--
--   receivables_assessment_updated — the employee (re-)assessed a
--                                     customer's outstanding receivables
--                                     using the approved deterministic
--                                     decision matrix. Logged every time
--                                     refreshReceivablesAssessment() runs
--                                     (background after invoice/payment
--                                     events, or the backfill route) —
--                                     same logging cadence convention as
--                                     customer_insights_updated.
--
-- Inspected the CURRENT constraint (added by
-- 20260815120000_add_payment_decision_wait_completed_activity_type.sql)
-- before writing this migration. All 20 existing allowed values are
-- preserved verbatim, unchanged, in the same order — this migration adds
-- exactly one value and does not otherwise redesign the constraint.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before receivables assessment activity logging will
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
        'receivables_assessment_updated'::text
    ]));
