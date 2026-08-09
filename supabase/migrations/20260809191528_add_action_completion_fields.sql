-- Adds explicit, human-driven action-completion evidence for Mission/
-- Decision tracking. These are deliberately separate from business
-- outcome fields (payment status, invoice confidence) and from
-- reminders.delivery_status (which only ever means "communication
-- sent", never "work completed").
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before the application code that depends on
-- these columns will function against a real database.

ALTER TABLE public.reminders
    ADD COLUMN actioned_at timestamp with time zone NULL;

COMMENT ON COLUMN public.reminders.actioned_at IS
    'The time a human explicitly marked this follow-up as completed/handled. Distinct from delivery_status, which only tracks whether the communication was sent.';

ALTER TABLE public.invoices
    ADD COLUMN confidence_reviewed_at timestamp with time zone NULL;

COMMENT ON COLUMN public.invoices.confidence_reviewed_at IS
    'The time a human explicitly reviewed and completed review of this invoice''s extraction. Independent of invoice_confidence_score/level/reasons, which remain AI-only signals.';
