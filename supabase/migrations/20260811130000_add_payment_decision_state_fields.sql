-- Payment Decision Safety Boundary — schema capability only.
--
-- Adds two nullable fields to public.payment_decisions in preparation
-- for a future safety layer (approval-time / execution-time
-- revalidation, Wait behavior). This migration does NOT change any
-- existing behavior — nothing in the application writes these columns
-- yet.
--
-- resolution_reason
--   Explains why a decision that will no longer execute was resolved,
--   distinct from needs_review_reason (which explains why a decision
--   needed review AT MATCH TIME). The initial and only supported value
--   is 'invoice_already_settled', for the future combination:
--     status = 'rejected'
--     resolution_reason = 'invoice_already_settled'
--   meaning: the payment claim may have been valid, but the invoice
--   was already settled by the time this decision was (or would have
--   been) executed, so it no longer requires execution. This reuses
--   the existing status = 'rejected' value, which no code path writes
--   today.
--
-- deferred_at
--   Represents that a human intentionally deferred a decision (the
--   future Wait action), independent of and orthogonal to
--   resolution_reason above. Future intended state:
--     status = 'pending'
--     deferred_at = <timestamp>
--   No default, no automatic behavior, no queue filtering — this
--   migration only adds the column.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before any application code depending on these
-- columns will function against a real database.

ALTER TABLE public.payment_decisions
    ADD COLUMN resolution_reason text,
    ADD COLUMN deferred_at timestamp with time zone;

ALTER TABLE public.payment_decisions
    ADD CONSTRAINT payment_decisions_resolution_reason_check
    CHECK (resolution_reason IS NULL OR resolution_reason = ANY (ARRAY[
        'invoice_already_settled'::text
    ]));

COMMENT ON COLUMN public.payment_decisions.resolution_reason IS
    'Set when a decision is resolved without executing because it is no longer actionable (e.g. the invoice was already settled by another payment). Distinct from needs_review_reason, which is set at match time. Not yet written by any code path.';

COMMENT ON COLUMN public.payment_decisions.deferred_at IS
    'Set when a human intentionally defers this decision (future Wait action). Independent of resolution_reason. Not yet written by any code path.';
