-- Responsibility #6 (Manage Promises to Pay) — the smallest schema
-- change needed to judge a promise's fulfilment against reality rather
-- than merely "did the whole case's balance clear".
--
-- GAP THIS CLOSES: prior to this migration, collection_cases had no way
-- to tell whether a SPECIFIC promise was kept. promise_status only ever
-- flipped to 'kept' as a side effect of the ENTIRE case resolving
-- (customer_receivables_assessments reporting zero outstanding for the
-- whole customer) — see collectionDecisionEngine.ts::buildResolution().
-- That conflates two different facts: "did the customer honor THIS
-- commitment" and "is the customer's account fully settled". A customer
-- who promises INR 50,000 by a date, pays exactly that, but has an
-- older, unrelated overdue invoice for INR 5,000 elsewhere on the
-- account, would previously have that promise marked 'broken' at grace
-- expiry (T19) purely because SOME balance remained — even though the
-- promise itself was fully honored. There was no reconciled figure to
-- compare the promise against at the moment it was made.
--
-- promise_baseline_outstanding_amount closes this: a frozen snapshot of
-- customer_receivables_assessments.evidence.outstandingAmount (#2's own
-- live, reconciled truth — never re-derived from raw payments/invoices
-- rows here) taken the instant a promise is accepted or revised
-- (services/server/collectionDecisionEngine.ts's T4 branch). At
-- evaluation time, (baseline - #2's CURRENT outstandingAmount) is how
-- much has actually been paid down since the promise was made —
-- compared against promise_amount to classify the promise as fulfilled,
-- partial, or broken. This reuses #2's reconciliation as the single
-- source of truth; it does not rebuild payment reconciliation.
--
-- promise_status also gains 'partial' — a promise whose grace window
-- expired with SOME but not all of the promised amount paid down.
-- Distinct from 'broken' (zero progress) so the audit trail and
-- case-visible history never overstate a partial payment as a fully
-- broken commitment.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before promise-lifecycle persistence will function
-- against a real database.

ALTER TABLE public.collection_cases
    ADD COLUMN promise_baseline_outstanding_amount numeric
        CHECK (promise_baseline_outstanding_amount IS NULL OR promise_baseline_outstanding_amount >= 0::numeric);

COMMENT ON COLUMN public.collection_cases.promise_baseline_outstanding_amount IS
    'Snapshot of customer_receivables_assessments.evidence.outstandingAmount at the moment THIS promise (promise_amount/date/etc.) was accepted or last revised. Used only to compute amountPaidSincePromise = baseline - current outstandingAmount when judging fulfilment (collectionDecisionEngine.ts::buildPromiseOutcome()) — never a live value itself, and never read for anything else. Null for a case that has never had a promise, or for a row that predates this column (treated as "no baseline available", not zero progress, by the decision engine).';

-- Inspected the CURRENT constraint (added by
-- 20260817120000_add_collection_cases.sql, verified directly against
-- that file rather than assumed) before writing this. Preserves all 4
-- existing values verbatim, adds exactly 'partial'.
ALTER TABLE public.collection_cases
    DROP CONSTRAINT IF EXISTS collection_cases_promise_status_check;

ALTER TABLE public.collection_cases
    ADD CONSTRAINT collection_cases_promise_status_check
    CHECK (promise_status IS NULL OR promise_status = ANY (ARRAY[
        'active'::text,
        'kept'::text,
        'broken'::text,
        'superseded'::text,
        'partial'::text
    ]));
