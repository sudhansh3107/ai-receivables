-- Responsibility #7 (Handle Disputes / Blockers / Exceptions) — the
-- smallest schema change needed to stop discarding extraction
-- confidence for disputes and blockers.
--
-- GAP THIS CLOSES: collectionExceptionExtractionService.ts::
-- extractExceptionDetails() has always returned a `confidence` value
-- alongside exceptionType/detail, but neither the T6 (dispute) nor T9
-- (payment_blocker) branch of collectionDecisionEngine.ts ever
-- persisted it anywhere — not on collection_cases, not even in the
-- activity_log evidence bundle. It was computed by the LLM call and
-- silently discarded. This is the exact same asymmetry
-- promise_confidence already fixed for promises (see
-- 20260817120000_add_collection_cases.sql) — exception_confidence
-- mirrors it precisely, same nullable-numeric-with-a-0..1-range-check
-- shape.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before exception-confidence persistence will
-- function against a real database.

ALTER TABLE public.collection_cases
    ADD COLUMN exception_confidence numeric
        CHECK (exception_confidence IS NULL OR (exception_confidence >= 0::numeric AND exception_confidence <= 1::numeric));

COMMENT ON COLUMN public.collection_cases.exception_confidence IS
    'Confidence the LLM assigned to exceptionType when this exception (dispute or blocker) was last opened or revised — see collectionExceptionExtractionService.ts::extractExceptionDetails(). Mirrors promise_confidence exactly. Note this is NEVER used as an acceptance gate for disputes (dispute is accepted unconditionally, per the approved v2 design) and is distinct from classification_confidence (the email-classification confidence, which IS the payment_blocker acceptance gate) — this column is extraction-quality evidence only.';
