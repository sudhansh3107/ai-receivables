-- Extends activity_log.activity_type's CHECK constraint with a single new
-- value so payment-decision <-> actual-payment reconciliation
-- (services/server/paymentDecisionService.ts::
-- resolvePaymentDecisionsForSettledInvoice(), called from
-- services/server/paymentService.ts::recordPayment()) can record its
-- outcome in Activity:
--
--   payment_decision_resolved — a pending payment_decision was
--                                automatically resolved because its
--                                invoice reached balance_due=0 through
--                                an actual recorded payment. Logged in
--                                addition to (never instead of) the
--                                payment_recorded / invoice_paid
--                                activity recordPayment() already
--                                writes unconditionally for the payment
--                                itself — this is the separate fact
--                                that a human-attention item no longer
--                                needs attention, not the financial
--                                event. Mirrors the existing
--                                payment_decision_executed precedent,
--                                which is documented as logged
--                                alongside (not instead of) the same
--                                two financial-outcome types.
--
-- Inspected the CURRENT constraint (added by
-- 20260812150000_add_payment_proof_requested_activity_type.sql) before
-- writing this migration. All 17 existing allowed values are preserved
-- verbatim, unchanged, in the same order — this migration adds exactly
-- one value and does not otherwise redesign the constraint.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before payment-decision-resolution activity
-- logging will function against a real database.

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
        'payment_decision_resolved'::text
    ]));
