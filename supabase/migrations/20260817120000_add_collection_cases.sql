-- Responsibility #3 (Collections & Follow-Up) — core case table.
--
-- One row per collection case. Customer-scoped (hybrid model, approved):
-- case state/ownership belongs to the customer relationship, never an
-- individual invoice; invoice-level detail is carried as evidence
-- (triggering_invoice_id, exception_* fields) rather than as a separate
-- case per invoice. A customer may accumulate several cases over time
-- (Case A resolved in March, Case B opened in August), so customer_id is
-- deliberately NOT unique on this table — only the partial index below
-- constrains the ACTIVE set to at most one non-resolved case per
-- customer, which is what actually prevents multiple simultaneous
-- collection threads against the same customer.
--
-- Does not duplicate or recompute Responsibility #1 (customer_insights)
-- or Responsibility #2 (customer_receivables_assessments) — both are
-- read live wherever the decision engine (services/server/
-- collectionDecisionEngine.ts) needs them. opening_assessment_snapshot
-- below is a frozen, one-time AUDIT copy of #2's output at case-open
-- time (why this case exists), not a value ever compared against for
-- escalation — the canonical escalation gate always reads #2 live.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before Responsibility #3 persistence will function
-- against a real database.

CREATE TABLE public.collection_cases (
    id uuid NOT NULL DEFAULT gen_random_uuid(),

    customer_id uuid NOT NULL,

    status text NOT NULL CHECK (status = ANY (ARRAY[
        'open'::text,
        'awaiting_response'::text,
        'promise_to_pay'::text,
        'payment_blocked'::text,
        'disputed'::text,
        'unresponsive'::text,
        'escalated'::text,
        'resolved'::text
    ])),

    opened_at timestamp with time zone NOT NULL DEFAULT now(),
    closed_at timestamp with time zone,
    closed_reason text CHECK (closed_reason IS NULL OR closed_reason = ANY (ARRAY[
        'resolved_paid'::text,
        'resolved_no_exposure'::text,
        'resolved_manual'::text
    ])),

    triggering_invoice_id uuid,
    opening_assessment_snapshot jsonb NOT NULL,

    last_decision text CHECK (last_decision IS NULL OR last_decision = ANY (ARRAY[
        'wait'::text,
        'contact'::text,
        'follow_up'::text,
        'check_in'::text,
        'acknowledge_promise'::text,
        'acknowledge_exception'::text,
        'escalate'::text,
        'resolve'::text
    ])),
    last_decision_reason text,
    last_decision_at timestamp with time zone,
    last_action_at timestamp with time zone,

    next_evaluation_at timestamp with time zone NOT NULL,

    outreach_count integer NOT NULL DEFAULT 0 CHECK (outreach_count >= 0),
    unanswered_outreach_count integer NOT NULL DEFAULT 0 CHECK (unanswered_outreach_count >= 0),
    last_outreach_at timestamp with time zone,

    last_response_at timestamp with time zone,
    last_response_classification text,
    last_response_email_id uuid,

    promise_amount numeric CHECK (promise_amount IS NULL OR promise_amount > 0::numeric),
    promise_currency text CHECK (promise_currency IS NULL OR promise_currency = ANY (ARRAY['INR'::text, 'USD'::text, 'EUR'::text, 'AED'::text, 'GBP'::text])),
    promise_date date,
    promise_source_email_id uuid,
    promise_confidence numeric CHECK (promise_confidence IS NULL OR (promise_confidence >= 0::numeric AND promise_confidence <= 1::numeric)),
    promise_status text CHECK (promise_status IS NULL OR promise_status = ANY (ARRAY['active'::text, 'kept'::text, 'broken'::text, 'superseded'::text])),
    broken_promise_count integer NOT NULL DEFAULT 0 CHECK (broken_promise_count >= 0),

    exception_category text CHECK (exception_category IS NULL OR exception_category = ANY (ARRAY['dispute'::text, 'blocker'::text])),
    exception_type text CHECK (exception_type IS NULL OR exception_type = ANY (ARRAY[
        'invoice_incorrect'::text,
        'goods_not_received'::text,
        'amount_disputed'::text,
        'po_issue'::text,
        'approval_pending'::text,
        'documentation_issue'::text,
        'vendor_onboarding'::text,
        'tax_compliance'::text,
        'blocked_internally'::text,
        'other'::text
    ])),
    exception_status text CHECK (exception_status IS NULL OR exception_status = ANY (ARRAY['open'::text, 'routed_to_human'::text, 'resolved'::text])),
    exception_detail text,
    exception_source_email_id uuid,
    exception_opened_at timestamp with time zone,

    escalated_at timestamp with time zone,
    escalation_reason text,
    escalation_evidence jsonb,
    escalation_deferred_at timestamp with time zone,

    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),

    CONSTRAINT collection_cases_pkey PRIMARY KEY (id),

    CONSTRAINT collection_cases_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id),

    CONSTRAINT collection_cases_triggering_invoice_id_fkey
        FOREIGN KEY (triggering_invoice_id) REFERENCES public.invoices(id),

    CONSTRAINT collection_cases_last_response_email_id_fkey
        FOREIGN KEY (last_response_email_id) REFERENCES public.emails(id),

    CONSTRAINT collection_cases_promise_source_email_id_fkey
        FOREIGN KEY (promise_source_email_id) REFERENCES public.emails(id),

    CONSTRAINT collection_cases_exception_source_email_id_fkey
        FOREIGN KEY (exception_source_email_id) REFERENCES public.emails(id)
);

-- The uniqueness rule that actually prevents multiple simultaneous
-- collection threads against the same customer: at most one row per
-- customer_id whose status is not 'resolved'. customer_id itself is
-- intentionally NOT unique — historical (resolved) cases for the same
-- customer must be able to coexist with a later new case.
CREATE UNIQUE INDEX collection_cases_active_per_customer_idx
    ON public.collection_cases (customer_id)
    WHERE status <> 'resolved';

-- Drives the backfill sweep (services/server/collectionCaseService.ts::
-- getCasesDueForEvaluation()) — escalated cases are deliberately excluded
-- (they are human-owned until a human acts; see collectionCaseService.ts::
-- resumeCollectionCaseFromEscalation()/markCollectionCaseResolvedManually()),
-- and resolved cases never need re-evaluation.
CREATE INDEX collection_cases_next_evaluation_idx
    ON public.collection_cases (next_evaluation_at)
    WHERE status NOT IN ('resolved', 'escalated');

CREATE INDEX collection_cases_status_idx ON public.collection_cases (status);

COMMENT ON TABLE public.collection_cases IS
    'Responsibility #3 (Collections & Follow-Up): one customer-scoped collection case row per collections relationship over time. At most one non-resolved row per customer (see collection_cases_active_per_customer_idx). Consumes customer_insights (#1) and customer_receivables_assessments (#2) live and read-only — never recomputes or duplicates either.';

COMMENT ON COLUMN public.collection_cases.opening_assessment_snapshot IS
    'Frozen copy of customer_receivables_assessments at case-open time, for audit ("why did this case open") only. Never used as a live comparison basis — the canonical escalation gate always reads #2 live.';

COMMENT ON COLUMN public.collection_cases.escalation_deferred_at IS
    'Human "Keep monitoring" action on an escalated case. Hides the case from the decision queue for 24 hours via query-time filtering (mirrors payment_decisions.deferred_at exactly) — does NOT change status, does NOT suppress autonomous payment-triggered resolution.';
