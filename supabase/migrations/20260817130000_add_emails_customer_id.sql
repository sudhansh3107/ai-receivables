-- Responsibility #3 (Collections & Follow-Up) — minimum safe email
-- linkage. Adds a nullable customer_id to public.emails, resolved via
-- the same deterministic, exact-match lookup already used by the
-- payment-claim matcher (services/server/paymentEmailMatchingService.ts::
-- normalizeFromEmail + services/server/customerService.ts::
-- findCustomerByEmail/findCustomerByEmailSafe) — no new resolution
-- logic, no fuzzy matching.
--
-- Deliberately does NOT add invoice_id. Only payment_received emails
-- need invoice-number attribution, and that already exists, unchanged,
-- inside paymentEmailMatchingService.ts, resolved from extracted text at
-- process time rather than from a stored column. For every other
-- collection-relevant classification (payment_promise, dispute,
-- payment_blocker, reminder_response, customer_inquiry, invoice_related)
-- the customer-scoped case model needs no invoice attribution at all —
-- adding invoice_id here would invite exactly the unreliable invoice
-- attribution the approved design explicitly rejects.
--
-- Remains nullable: most emails will never resolve (irrelevant mail,
-- unknown senders, ambiguous multi-customer email matches — see
-- customerService.ts::findCustomerByEmailSafe()). An email with
-- customer_id IS NULL can never affect a collection case (fail-safe by
-- design).
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before customer attribution will persist against a
-- real database.

ALTER TABLE public.emails
    ADD COLUMN customer_id uuid;

ALTER TABLE public.emails
    ADD CONSTRAINT emails_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES public.customers(id);

CREATE INDEX emails_customer_id_idx ON public.emails (customer_id);

COMMENT ON COLUMN public.emails.customer_id IS
    'Deterministic, exact-match sender resolution (Responsibility #3) — populated only when the sender address matches exactly one customers.email row. NULL means unattributed (unknown sender, or an ambiguous match across more than one customer), never a guess. Intentionally no invoice_id column — see this migration''s header comment.';
