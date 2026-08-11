-- Day 9 — Payment Decision Execution.
--
-- Extends activity_log.activity_type's CHECK constraint with three new
-- values so the approved-payment execution flow (services/server/
-- paymentDecisionExecutionService.ts) can record human approval and
-- system execution outcomes in Activity, per the existing pattern of
-- separating human approval (payment_decisions.status) from system
-- execution outcome (payment_decisions.execution_status):
--
--   payment_decision_approved          — human approved a proposed
--                                         payment decision.
--   payment_decision_executed          — recordPayment() succeeded for
--                                         an approved decision. Logged
--                                         in addition to (not instead
--                                         of) the payment_recorded /
--                                         invoice_paid activity that
--                                         recordPayment() already
--                                         writes, so the trail makes
--                                         clear the payment originated
--                                         from an approved AI-drafted
--                                         decision rather than manual
--                                         entry.
--   payment_decision_execution_failed  — recordPayment() (or a
--                                         precondition check) failed
--                                         for an approved decision;
--                                         execution_error on the
--                                         decision row holds the
--                                         reason.
--
-- All existing allowed values are preserved unchanged. This migration
-- has NOT been applied to any live database from this environment —
-- it must be run manually (Supabase SQL editor or `supabase db push`)
-- before payment decision execution activity logging will function
-- against a real database.

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
        'payment_decision_execution_failed'::text
    ]));
