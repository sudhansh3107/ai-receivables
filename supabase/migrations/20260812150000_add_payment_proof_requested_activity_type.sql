-- Extends activity_log.activity_type's CHECK constraint with a single new
-- value so the "Request Proof" action (services/server/
-- paymentProofRequestService.ts) can record its outcome in Activity:
--
--   payment_proof_requested — a human explicitly clicked "Request Proof"
--                              on an unresolved payment_decision and a
--                              deterministic reply asking the customer for
--                              payment evidence was successfully sent
--                              through the connected Gmail account. Logged
--                              only after a successful Gmail send; the
--                              underlying payment_decision is NOT mutated
--                              by this action (it stays 'pending') — this
--                              is not an approval or execution event.
--
-- Inspected the CURRENT constraint (added by
-- 20260811120000_add_payment_decision_activity_types.sql) before writing
-- this migration. All 16 existing allowed values are preserved verbatim,
-- unchanged, in the same order — this migration adds exactly one value and
-- does not otherwise redesign the constraint.
--
-- Note: this migration does NOT address the pre-existing, unrelated gap
-- (found during a prior audit) where 'payment_claim_received' and
-- 'payment_claim_matched' are used in application code
-- (services/server/emailProcessingService.ts) but were never added to this
-- constraint by any migration. That is out of scope here — fixing it would
-- redesign the constraint's value set beyond what this task requires.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before payment-proof-request activity logging will
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
        'payment_proof_requested'::text
    ]));
