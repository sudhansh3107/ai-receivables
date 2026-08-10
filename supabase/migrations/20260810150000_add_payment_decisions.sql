-- Adds a durable approval boundary for AI-proposed payments detected
-- in classified inbound emails (see services/server/
-- paymentEmailMatchingService.ts::matchPaymentEmail(), which performs
-- ZERO writes and only returns a "ready"/"needs_review" decision for
-- something else to persist).
--
-- This table does NOT replace services/server/decisionService.ts
-- (the existing ephemeral ranking/read layer for the
-- low_confidence/payment_follow_up candidates) and does NOT itself
-- carry ledger authority — a decision becomes real money only once
-- payment_id references an actual row in public.payments, created via
-- the existing services/server/paymentService.ts::recordPayment().
--
-- One row per source email (UNIQUE(email_id)): reprocessing the same
-- email must update this row, never create a duplicate decision.
--
-- status (human approval) and execution_status (system outcome) are
-- deliberately separate columns, tied together by CHECK constraints,
-- so an approved decision can never be indistinguishable from a
-- successfully executed one if recordPayment() fails. execution_status
-- includes an "executing" state to support a concurrency-safe
-- optimistic-locking guard (e.g. UPDATE ... SET execution_status =
-- 'executing' WHERE execution_status = 'not_executed') so two
-- concurrent attempts to execute the same decision cannot both call
-- recordPayment().
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before any application code depending on this
-- table will function against a real database.

CREATE TABLE public.payment_decisions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),

    email_id uuid NOT NULL,
    customer_id uuid,
    invoice_id uuid,
    payment_id uuid,

    status text NOT NULL DEFAULT 'pending',
    execution_status text NOT NULL DEFAULT 'not_executed',
    needs_review_reason text,

    proposed_amount numeric,
    proposed_currency text,
    proposed_payment_date date,
    proposed_invoice_number text,
    proposed_payment_reference text,
    extraction_confidence numeric,

    match_evidence jsonb,

    execution_error text,

    approved_at timestamp with time zone,
    rejected_at timestamp with time zone,
    executed_at timestamp with time zone,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT payment_decisions_pkey PRIMARY KEY (id),

    CONSTRAINT payment_decisions_email_id_fkey
        FOREIGN KEY (email_id) REFERENCES public.emails(id),
    CONSTRAINT payment_decisions_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id),
    CONSTRAINT payment_decisions_invoice_id_fkey
        FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
    CONSTRAINT payment_decisions_payment_id_fkey
        FOREIGN KEY (payment_id) REFERENCES public.payments(id),

    CONSTRAINT payment_decisions_email_id_key UNIQUE (email_id),
    CONSTRAINT payment_decisions_payment_id_key UNIQUE (payment_id),

    CONSTRAINT payment_decisions_status_check
        CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),

    CONSTRAINT payment_decisions_execution_status_check
        CHECK (execution_status = ANY (ARRAY[
            'not_executed'::text, 'executing'::text,
            'executed'::text, 'execution_failed'::text
        ])),

    CONSTRAINT payment_decisions_needs_review_reason_check
        CHECK (needs_review_reason IS NULL OR needs_review_reason = ANY (ARRAY[
            'customer_not_found'::text, 'payment_facts_incomplete'::text,
            'low_extraction_confidence'::text, 'invoice_not_found'::text,
            'currency_mismatch'::text, 'invalid_amount'::text, 'overpayment'::text
        ])),

    CONSTRAINT payment_decisions_proposed_amount_check
        CHECK (proposed_amount IS NULL OR proposed_amount > 0::numeric),

    CONSTRAINT payment_decisions_extraction_confidence_check
        CHECK (extraction_confidence IS NULL OR (extraction_confidence >= 0::numeric AND extraction_confidence <= 1::numeric)),

    CONSTRAINT payment_decisions_executed_requires_payment_check
        CHECK (execution_status <> 'executed'::text OR payment_id IS NOT NULL),

    CONSTRAINT payment_decisions_execution_requires_approval_check
        CHECK (execution_status = 'not_executed'::text OR status = 'approved'::text),

    CONSTRAINT payment_decisions_single_outcome_check
        CHECK (NOT (approved_at IS NOT NULL AND rejected_at IS NOT NULL))
);

CREATE INDEX payment_decisions_status_idx ON public.payment_decisions (status);
CREATE INDEX payment_decisions_customer_id_idx ON public.payment_decisions (customer_id);
CREATE INDEX payment_decisions_invoice_id_idx ON public.payment_decisions (invoice_id);

COMMENT ON TABLE public.payment_decisions IS
    'Durable approval boundary for AI-proposed payments extracted from classified emails. Not a ledger — public.payments remains authoritative; payment_id links to the actual recorded payment only after successful execution.';

COMMENT ON COLUMN public.payment_decisions.email_id IS
    'The single source email this decision was derived from. UNIQUE — reprocessing the same email must update this row, never create a duplicate decision.';

COMMENT ON COLUMN public.payment_decisions.status IS
    'Human approval state: pending, approved, or rejected. Independent of execution_status — see payment_decisions_execution_requires_approval_check.';

COMMENT ON COLUMN public.payment_decisions.execution_status IS
    'System execution outcome, independent of human approval (status). "executing" supports a concurrency-safe optimistic-lock guard before calling recordPayment(). "executed" requires payment_id to be set (see payment_decisions_executed_requires_payment_check) so a failed recordPayment() can never look like a success.';

COMMENT ON COLUMN public.payment_decisions.needs_review_reason IS
    'Set when matchPaymentEmail() returned status "needs_review"; mirrors PaymentEmailNeedsReviewReason in services/server/paymentEmailMatchingService.ts. Null for a "ready" match.';

COMMENT ON COLUMN public.payment_decisions.match_evidence IS
    'Raw PaymentExtractionResult plus the normalized sender address, for display in a review UI. Never used for matching logic itself — matching is deterministic and already resolved into customer_id/invoice_id/proposed_* columns.';

COMMENT ON COLUMN public.payment_decisions.payment_id IS
    'Set exactly once, when recordPayment() succeeds for this decision. UNIQUE — no two decisions may claim the same payment row.';

COMMENT ON COLUMN public.payment_decisions.execution_error IS
    'Failure reason when execution_status = execution_failed. Null otherwise.';
