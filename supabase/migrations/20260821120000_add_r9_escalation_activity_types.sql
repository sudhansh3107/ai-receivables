-- Responsibility #9 (Escalate to Humans Appropriately) — extends
-- activity_log.activity_type's CHECK constraint with the 2 values the
-- new human-guidance loop needs. Escalation is NOT modeled as a
-- terminal state: a case can cycle
-- escalated -> human guidance -> active -> escalated again any number
-- of times (see services/server/collectionCaseService.ts::
-- provideCollectionCaseGuidance()). Each cycle's own
-- collection_case_escalated row (already an existing allowed value)
-- remains the durable "why" record for that cycle; these two new
-- values cover the two NEW human-facing events that close or defer a
-- cycle without ever overwriting or deleting a prior cycle's history:
--
--   collection_case_guidance_provided   — a human answered the
--                                          employee's "what happened,
--                                          how should I proceed?"
--                                          prompt with free-form
--                                          context/instruction. Logged
--                                          by provideCollectionCaseGuidance(),
--                                          which resumes the case (via
--                                          the existing
--                                          resumeCollectionCaseFromEscalation()
--                                          transition) in the same
--                                          action — this single row
--                                          documents both "human
--                                          provided guidance" and "case
--                                          resumed", so a plain
--                                          collection_case_resumed_by_human
--                                          row is never ALSO logged for
--                                          the same event.
--   collection_case_escalation_deferred — a human chose "Keep
--                                          monitoring" on an escalated
--                                          case (deferCollectionCaseEscalation()).
--                                          Previously this action left
--                                          NO activity_log trace at
--                                          all; every meaningful human
--                                          interaction with an
--                                          escalated case must now be
--                                          auditable. Logged only on
--                                          the actual outcome:"deferred"
--                                          transition, never on
--                                          outcome:"already_deferred"
--                                          (a repeated click within the
--                                          same 24h window), so this
--                                          stays idempotent per defer
--                                          cycle.
--
-- Inspected the CURRENT constraint (added by
-- 20260820130000_add_exception_revision_activity_types.sql, verified
-- directly against that file's own CHECK array) before writing this
-- migration. All 37 existing allowed values are preserved verbatim,
-- unchanged, in the same order — this migration adds exactly 2 new
-- values.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before R9 guidance/defer activity logging will
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
        'collection_blocker_revised'::text,
        'collection_case_guidance_provided'::text,
        'collection_case_escalation_deferred'::text
    ]));
