-- Final database-level payment recording safety boundary.
--
-- Closes the concurrent double-execution race that approval-time and
-- execution-time application-level revalidation (see services/server/
-- paymentDecisionExecutionService.ts) cannot close on their own: two
-- concurrent callers can each read the same pre-write balance before
-- either one writes, and both pass an application-level check. This
-- function moves "lock invoice -> read current payments -> validate
-- balance -> insert payment -> update invoice" into a single Postgres
-- transaction with a row lock on the invoice, so a second concurrent
-- call for the SAME invoice must wait for the first to finish before
-- it can even read the balance, and will then correctly see the
-- updated (post-first-payment) balance.
--
-- Called from services/server/paymentService.ts::recordPayment() via
-- supabase.rpc('record_payment_atomic', ...) — the ONLY caller. Not a
-- broad/generic database function: its arguments and return shape
-- exist solely to serve that one call site.
--
-- Outcome is returned as jsonb rather than raising an exception for
-- the two "no payment recorded" cases (already_paid, overpayment),
-- since those are legitimate business outcomes, not database errors —
-- recordPayment() turns them into a typed, catchable
-- PaymentRecordingRejectedError in application code. A genuine invoice
-- lookup miss (invoice_not_found) is also returned as jsonb rather
-- than left to surface as an opaque foreign-key-violation error from
-- the subsequent INSERT.
--
-- SECURITY INVOKER (the default — stated explicitly for clarity, not
-- because elevated privilege is needed): the calling role already has
-- direct INSERT/UPDATE access to public.payments/public.invoices today
-- via the existing anon-key client (see lib/supabase.ts), so this
-- function needs no more privilege than the caller already has. Every
-- table reference is schema-qualified (public.invoices,
-- public.payments), which removes the search_path hijack risk an
-- explicit `SET search_path` would otherwise guard against, so one is
-- not added here.
--
-- Preserves the exact business logic of services/server/
-- paymentService.ts::calculateInvoiceBalance() (balance = GREATEST
-- (invoice_amount - total_paid, 0); status = paid when balance is 0,
-- partial when balance < invoice_amount, otherwise pending) — this SQL
-- mirrors that function 1:1 because the whole point of this migration
-- is moving the calculation inside the locked transaction; if
-- calculateInvoiceBalance() ever changes, this function must be
-- updated to match.
--
-- Does NOT introduce any UNIQUE constraint on invoice_id or
-- (invoice_id, amount) — legitimate multiple/partial payments against
-- the same invoice remain fully possible; the invoice row lock is the
-- only new constraint, and it is released at transaction end, not held
-- across separate payments.
--
-- This migration has NOT been applied to any live database from this
-- environment — it must be run manually (Supabase SQL editor or
-- `supabase db push`) before recordPayment() will function against a
-- real database.

CREATE OR REPLACE FUNCTION public.record_payment_atomic(
    p_invoice_id uuid,
    p_customer_id uuid,
    p_amount numeric,
    p_payment_date date,
    p_payment_method text,
    p_payment_reference text,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
    v_invoice_amount numeric;
    v_invoice_number text;
    v_total_paid numeric;
    v_balance_due numeric;
    v_new_total_paid numeric;
    v_new_balance_due numeric;
    v_new_status text;
    v_payment jsonb;
BEGIN
    -- Row lock: the actual serialization boundary. A concurrent call
    -- for the SAME invoice blocks here until this transaction commits
    -- or rolls back, so it can never read the pre-this-payment balance.
    SELECT invoice_amount, invoice_number
    INTO v_invoice_amount, v_invoice_number
    FROM public.invoices
    WHERE id = p_invoice_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('outcome', 'invoice_not_found');
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM public.payments
    WHERE invoice_id = p_invoice_id;

    v_balance_due := GREATEST(v_invoice_amount - v_total_paid, 0);

    -- CASE A — already settled: nothing remains to pay. No payment
    -- row, no invoice mutation.
    IF v_balance_due <= 0 THEN
        RETURN jsonb_build_object(
            'outcome', 'already_paid',
            'currentBalance', v_balance_due
        );
    END IF;

    -- CASE B — proposed amount exceeds what remains right now. No
    -- payment row, no invoice mutation, no truncation of the amount.
    IF p_amount > v_balance_due THEN
        RETURN jsonb_build_object(
            'outcome', 'overpayment',
            'currentBalance', v_balance_due
        );
    END IF;

    -- CASE C — fits the current balance: record it.
    INSERT INTO public.payments (
        invoice_id, customer_id, amount, payment_date,
        payment_method, payment_reference, notes
    ) VALUES (
        p_invoice_id, p_customer_id, p_amount, p_payment_date,
        p_payment_method, p_payment_reference, p_notes
    )
    RETURNING to_jsonb(payments.*) INTO v_payment;

    v_new_total_paid := v_total_paid + p_amount;
    v_new_balance_due := GREATEST(v_invoice_amount - v_new_total_paid, 0);

    v_new_status := CASE
        WHEN v_new_balance_due = 0 THEN 'paid'
        WHEN v_new_balance_due < v_invoice_amount THEN 'partial'
        ELSE 'pending'
    END;

    UPDATE public.invoices
    SET balance_due = v_new_balance_due,
        status = v_new_status,
        updated_at = now()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'outcome', 'recorded',
        'payment', v_payment,
        'balanceDue', v_new_balance_due,
        'status', v_new_status,
        'invoiceNumber', v_invoice_number
    );
END;
$$;

COMMENT ON FUNCTION public.record_payment_atomic IS
    'Atomic, lock-serialized payment recording: the database-level counterpart to services/server/paymentService.ts::recordPayment(). Locks the invoice row (SELECT ... FOR UPDATE), revalidates the current balance under that lock, and only then inserts the payment and reconciles the invoice — closing the concurrent double-execution race that application-level pre-checks alone cannot close. Sole caller: recordPayment() via supabase.rpc().';

-- The calling role (anon, via lib/supabase.ts) already has direct
-- INSERT/UPDATE access to public.payments/public.invoices today; this
-- grant enables the equivalent capability through the function instead
-- of raw table access, without exceeding the existing security
-- posture.
GRANT EXECUTE ON FUNCTION public.record_payment_atomic(
    uuid, uuid, numeric, date, text, text, text
) TO anon, authenticated;
