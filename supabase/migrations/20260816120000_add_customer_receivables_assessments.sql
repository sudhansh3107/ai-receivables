-- Responsibility #2 — Monitor Outstanding Receivables.
--
-- One row per customer (UNIQUE(customer_id), mirrors public.customer_insights),
-- holding the output of the approved deterministic decision matrix in
-- services/server/receivablesMonitoringService.ts::computeReceivablesAssessment().
-- That function is a pure lookup over existing signals (outstanding/overdue
-- amounts computed fresh from public.invoices, plus risk_level/
-- average_late_payment_days/payment_consistency_score already computed and
-- persisted by public.customer_insights) — it does NOT recompute Customer
-- Intelligence (Responsibility #1); this table only stores its own output.
--
-- assessment/priority are the decision matrix's outputs. severity/deviation/
-- terms_breach/matrix_row are the exact inputs+matched row of that matrix,
-- persisted alongside the result so every assessment is auditable after the
-- fact without re-deriving it — matrix_row (1-14) points at the specific
-- approved matrix row that produced this outcome. reason is a deterministic,
-- templated sentence built only from these signals (no LLM call — the
-- decision engine and its explanation are both fully deterministic).
-- evidence is the full structured signal set the reason/assessment were
-- computed from (amounts, counts, days overdue, baseline, risk level,
-- consistency score) for machine-readable audit/display.
--
-- Critical is reachable ONLY when severity = 'elevated' AND deviation =
-- 'severe' (matrix row 12). deviation = 'severe' requires hasBaseline (a
-- real paid-invoice history), which is structurally impossible for a
-- customer whose risk_level is insufficient_history/limited_history — for
-- those customers deviation is always 'unknown' and assessment therefore
-- caps at 'needs_attention' (see matrix rows 13-14). This is enforced by
-- the constraint below (deviation = 'severe' can coexist with any
-- assessment except it is the only path INTO 'critical'; the reverse — no
-- assessment other than 'critical' may combine severity='elevated' AND
-- deviation='severe' — is enforced in application code via matrix_row's
-- 1:1 mapping to (assessment, priority), not re-derived in SQL).
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before receivables assessment persistence will
-- function against a real database.

CREATE TABLE public.customer_receivables_assessments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),

    customer_id uuid NOT NULL,

    assessment text NOT NULL,
    priority text NOT NULL,

    severity text NOT NULL,
    deviation text NOT NULL,
    terms_breach boolean NOT NULL DEFAULT false,

    -- 1-14, the approved decision matrix row that produced this result.
    matrix_row smallint NOT NULL,

    reason text NOT NULL,
    evidence jsonb NOT NULL,

    assessed_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT customer_receivables_assessments_pkey PRIMARY KEY (id),

    CONSTRAINT customer_receivables_assessments_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id),

    CONSTRAINT customer_receivables_assessments_customer_id_key
        UNIQUE (customer_id),

    CONSTRAINT customer_receivables_assessments_assessment_check
        CHECK (assessment = ANY (ARRAY[
            'no_immediate_attention'::text,
            'monitor'::text,
            'needs_attention'::text,
            'critical'::text
        ])),

    CONSTRAINT customer_receivables_assessments_priority_check
        CHECK (priority = ANY (ARRAY[
            'low'::text, 'medium'::text, 'high'::text, 'critical'::text
        ])),

    CONSTRAINT customer_receivables_assessments_severity_check
        CHECK (severity = ANY (ARRAY[
            'none'::text, 'low'::text, 'elevated'::text
        ])),

    CONSTRAINT customer_receivables_assessments_deviation_check
        CHECK (deviation = ANY (ARRAY[
            'not_applicable'::text, 'unknown'::text,
            'within_pattern'::text, 'moderate'::text, 'severe'::text
        ])),

    CONSTRAINT customer_receivables_assessments_matrix_row_check
        CHECK (matrix_row >= 1 AND matrix_row <= 14)
);

CREATE INDEX customer_receivables_assessments_assessment_idx
    ON public.customer_receivables_assessments (assessment);

CREATE INDEX customer_receivables_assessments_priority_idx
    ON public.customer_receivables_assessments (priority);

COMMENT ON TABLE public.customer_receivables_assessments IS
    'Responsibility #2 (Monitor Outstanding Receivables) output: one row per customer holding the current assessment/priority produced by the approved deterministic decision matrix, plus the inputs and matrix row for audit. Does not duplicate Customer Intelligence (public.customer_insights) — reads risk_level/average_late_payment_days/payment_consistency_score from it rather than recomputing them.';

COMMENT ON COLUMN public.customer_receivables_assessments.matrix_row IS
    'Which row (1-14) of the approved decision matrix produced this result — direct audit trail from stored output back to the exact rule that fired.';

COMMENT ON COLUMN public.customer_receivables_assessments.evidence IS
    'Structured signal set the assessment was computed from: outstanding/overdue amounts and share, overdue invoice count, max days overdue, the customer''s baseline delay, deviation ratio, risk level, payment consistency score, and terms_breach. No monetary or day-count thresholds are hardcoded here — this is the trace of what was already true, not a rule.';

COMMENT ON COLUMN public.customer_receivables_assessments.reason IS
    'Deterministic, templated human-readable explanation built only from evidence — never an LLM-generated summary, so it is exactly reproducible from the stored evidence.';
