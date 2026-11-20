-- =====================================================================
-- BOOKIFY 005 - Payment plans, 5-minute payment window, booking reasons,
--               business reviews (stars) and platform testimonials.
-- Additive and idempotent: safe to run more than once. Run in the Supabase
-- SQL Editor (or as a migration) AFTER 001-004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reservation payment state and the reason shown to owners/clients
-- ---------------------------------------------------------------------
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS payment_plan VARCHAR(10),
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_in_full_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS balance_paid_via VARCHAR(10),
  ADD COLUMN IF NOT EXISTS status_reason TEXT,
  ADD COLUMN IF NOT EXISTS status_changed_by VARCHAR(10);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_payment_plan_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_payment_plan_check
      CHECK (payment_plan IS NULL OR payment_plan IN ('DEPOSIT', 'FULL'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_amount_paid_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_amount_paid_check
      CHECK (amount_paid >= 0 AND (total_amount IS NULL OR amount_paid <= total_amount));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_balance_paid_via_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_balance_paid_via_check
      CHECK (balance_paid_via IS NULL OR balance_paid_via IN ('ONLINE', 'IN_STORE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_status_reason_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_reason_check
      CHECK (status_reason IS NULL OR length(status_reason) <= 300);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_status_changed_by_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_status_changed_by_check
      CHECK (status_changed_by IS NULL OR status_changed_by IN ('CLIENT', 'BUSINESS', 'ADMIN', 'SYSTEM'));
  END IF;
END $$;

-- Existing confirmed bookings were paid with the 50 % demo deposit
UPDATE public.reservations r
   SET payment_plan = 'DEPOSIT', amount_paid = r.deposit_amount
 WHERE r.payment_plan IS NULL
   AND r.status IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW')
   AND EXISTS (SELECT 1 FROM public.bookify_mock_deposit_payments p WHERE p.reservation_id = r.id);

UPDATE public.reservations
   SET status_reason = 'Payment not completed before the payment window closed',
       status_changed_by = 'SYSTEM'
 WHERE status = 'EXPIRED' AND status_reason IS NULL;

-- Every expiry path (job and the reservation functions) gets a reason
CREATE OR REPLACE FUNCTION public.bookify_reservation_reason()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.status = 'EXPIRED' AND OLD.status IS DISTINCT FROM 'EXPIRED' AND NEW.status_reason IS NULL THEN
    NEW.status_reason := 'Payment not completed before the payment window closed';
    NEW.status_changed_by := 'SYSTEM';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookify_reservation_reason ON public.reservations;
CREATE TRIGGER trg_bookify_reservation_reason
  BEFORE UPDATE OF status ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.bookify_reservation_reason();

-- ---------------------------------------------------------------------
-- 2. Payment window: 15 minutes -> 5 minutes in both booking functions
-- ---------------------------------------------------------------------
DO $$
DECLARE
  f RECORD;
  def TEXT;
BEGIN
  FOR f IN
    SELECT p.oid FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('create_pending_reservation', 'create_pending_purchase')
  LOOP
    def := pg_get_functiondef(f.oid);
    IF position('INTERVAL ''15 minutes''' IN def) > 0 THEN
      EXECUTE replace(def, 'INTERVAL ''15 minutes''', 'INTERVAL ''5 minutes''');
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 3. Demo payments: deposit (50 %), full (100 %) and online balance
-- ---------------------------------------------------------------------
ALTER TABLE public.bookify_mock_deposit_payments
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'DEPOSIT';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookify_mock_payments_kind_check') THEN
    ALTER TABLE public.bookify_mock_deposit_payments ADD CONSTRAINT bookify_mock_payments_kind_check
      CHECK (kind IN ('DEPOSIT', 'FULL', 'BALANCE'));
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookify_mock_deposit_payments_reservation_id_key') THEN
    ALTER TABLE public.bookify_mock_deposit_payments DROP CONSTRAINT bookify_mock_deposit_payments_reservation_id_key;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookify_mock_payments_reservation_kind_key') THEN
    ALTER TABLE public.bookify_mock_deposit_payments ADD CONSTRAINT bookify_mock_payments_reservation_kind_key
      UNIQUE (reservation_id, kind);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bookify_pay_mock(
  p_reservation_id BIGINT,
  p_user_id BIGINT,
  p_plan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.reservations%ROWTYPE;
  p public.bookify_mock_deposit_payments%ROWTYPE;
  v_plan TEXT := upper(coalesce(p_plan, ''));
  v_amount NUMERIC(12,2);
  v_already BOOLEAN := FALSE;
BEGIN
  IF p_reservation_id IS NULL OR p_reservation_id < 1 OR p_user_id IS NULL OR p_user_id < 1 THEN
    RAISE EXCEPTION 'Invalid reservation or user ID' USING ERRCODE = '22023';
  END IF;
  IF v_plan NOT IN ('DEPOSIT', 'FULL', 'BALANCE') THEN
    RAISE EXCEPTION 'Payment option must be DEPOSIT, FULL or BALANCE' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;
  IF r.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'This reservation does not belong to your account' USING ERRCODE = '42501';
  END IF;

  IF v_plan IN ('DEPOSIT', 'FULL') THEN
    -- Retry of a payment that already went through: answer with the same result
    SELECT * INTO p FROM public.bookify_mock_deposit_payments
     WHERE reservation_id = r.id AND kind IN ('DEPOSIT', 'FULL')
     ORDER BY id LIMIT 1;
    IF FOUND THEN
      v_already := TRUE;
    ELSE
      IF r.status <> 'PENDING_PAYMENT' THEN
        RAISE EXCEPTION 'Only reservations awaiting payment can be paid' USING ERRCODE = 'P0001';
      END IF;
      IF r.payment_expires_at IS NULL OR r.payment_expires_at <= now() THEN
        RAISE EXCEPTION 'The 5-minute payment window has expired' USING ERRCODE = 'P0001';
      END IF;
      IF r.starts_at <= now() THEN
        RAISE EXCEPTION 'Cannot pay for an appointment that already started' USING ERRCODE = 'P0001';
      END IF;
      IF r.total_amount IS NULL OR r.total_amount <= 0 THEN
        RAISE EXCEPTION 'Reservation has no price' USING ERRCODE = 'P0001';
      END IF;

      v_amount := CASE v_plan WHEN 'FULL' THEN r.total_amount ELSE r.deposit_amount END;

      INSERT INTO public.bookify_mock_deposit_payments (reservation_id, user_id, amount, currency, kind)
      VALUES (r.id, p_user_id, v_amount, r.currency, v_plan)
      RETURNING * INTO p;

      UPDATE public.reservations
         SET status = 'CONFIRMED',
             payment_plan = v_plan,
             amount_paid = v_amount,
             paid_in_full_at = CASE WHEN v_plan = 'FULL' THEN now() ELSE NULL END,
             balance_paid_via = CASE WHEN v_plan = 'FULL' THEN 'ONLINE' ELSE NULL END,
             status_reason = NULL,
             status_changed_by = 'CLIENT',
             updated_at = now()
       WHERE id = r.id AND status = 'PENDING_PAYMENT'
      RETURNING * INTO r;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Reservation state changed before confirmation' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSE
    -- Pay the remaining 50 % online after a deposit
    SELECT * INTO p FROM public.bookify_mock_deposit_payments
     WHERE reservation_id = r.id AND kind = 'BALANCE';
    IF FOUND THEN
      v_already := TRUE;
    ELSE
      IF r.status <> 'CONFIRMED' OR r.payment_plan IS DISTINCT FROM 'DEPOSIT' THEN
        RAISE EXCEPTION 'Only confirmed bookings paid with the 50 percent deposit have a balance' USING ERRCODE = 'P0001';
      END IF;
      IF r.amount_paid >= r.total_amount THEN
        RAISE EXCEPTION 'This booking is already paid in full' USING ERRCODE = 'P0001';
      END IF;
      IF r.ends_at <= now() THEN
        RAISE EXCEPTION 'The appointment already ended; settle the balance at the business' USING ERRCODE = 'P0001';
      END IF;

      v_amount := r.total_amount - r.amount_paid;

      INSERT INTO public.bookify_mock_deposit_payments (reservation_id, user_id, amount, currency, kind)
      VALUES (r.id, p_user_id, v_amount, r.currency, 'BALANCE')
      RETURNING * INTO p;

      UPDATE public.reservations
         SET amount_paid = total_amount,
             paid_in_full_at = now(),
             balance_paid_via = 'ONLINE',
             updated_at = now()
       WHERE id = r.id
      RETURNING * INTO r;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'already_paid', v_already,
    'reservation', jsonb_build_object(
      'id', r.id, 'status', r.status, 'payment_plan', r.payment_plan,
      'total_amount', r.total_amount, 'deposit_amount', r.deposit_amount,
      'balance_amount', r.balance_amount, 'amount_paid', r.amount_paid,
      'paid_in_full_at', r.paid_in_full_at, 'balance_paid_via', r.balance_paid_via,
      'currency', r.currency, 'starts_at', r.starts_at),
    'payment', jsonb_build_object(
      'id', p.id, 'kind', p.kind, 'amount', p.amount, 'currency', p.currency,
      'status', p.status, 'method', 'MOCK', 'created_at', p.created_at)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bookify_pay_mock(BIGINT, BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bookify_pay_mock(BIGINT, BIGINT, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Owner actions on a received booking
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bookify_owner_update_reservation(
  p_reservation_id BIGINT,
  p_actor_id BIGINT,
  p_is_admin BOOLEAN,
  p_action TEXT,
  p_reason TEXT
)
RETURNS public.reservations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  r public.reservations%ROWTYPE;
  v_action TEXT := upper(coalesce(p_action, ''));
  v_reason TEXT := nullif(btrim(coalesce(p_reason, '')), '');
  v_actor TEXT := CASE WHEN p_is_admin THEN 'ADMIN' ELSE 'BUSINESS' END;
BEGIN
  IF v_reason IS NOT NULL AND length(v_reason) > 300 THEN
    RAISE EXCEPTION 'The reason cannot exceed 300 characters' USING ERRCODE = '22023';
  END IF;

  SELECT r2.* INTO r FROM public.reservations r2 WHERE r2.id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT p_is_admin AND NOT EXISTS (
    SELECT 1 FROM public.businesses b WHERE b.id = r.business_id AND b.owner_id = p_actor_id
  ) THEN
    RAISE EXCEPTION 'This reservation does not belong to your business' USING ERRCODE = '42501';
  END IF;

  IF v_action = 'BALANCE_PAID_IN_STORE' THEN
    IF r.status NOT IN ('CONFIRMED', 'COMPLETED') OR r.payment_plan IS DISTINCT FROM 'DEPOSIT'
       OR r.amount_paid >= r.total_amount THEN
      RAISE EXCEPTION 'Only confirmed deposit bookings with a pending balance can be settled' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.reservations
       SET amount_paid = total_amount, paid_in_full_at = now(), balance_paid_via = 'IN_STORE',
           status_changed_by = v_actor, updated_at = now()
     WHERE id = r.id RETURNING * INTO r;

  ELSIF v_action = 'COMPLETED' THEN
    IF r.status <> 'CONFIRMED' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be marked as completed' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.reservations
       SET status = 'COMPLETED', status_reason = v_reason, status_changed_by = v_actor, updated_at = now()
     WHERE id = r.id RETURNING * INTO r;

  ELSIF v_action = 'NO_SHOW' THEN
    IF r.status <> 'CONFIRMED' THEN
      RAISE EXCEPTION 'Only confirmed bookings can be marked as no-show' USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.reservations
       SET status = 'NO_SHOW', status_reason = coalesce(v_reason, 'The client did not attend the appointment'),
           status_changed_by = v_actor, updated_at = now()
     WHERE id = r.id RETURNING * INTO r;

  ELSIF v_action = 'CANCEL' THEN
    IF r.status NOT IN ('PENDING_PAYMENT', 'CONFIRMED') THEN
      RAISE EXCEPTION 'Only pending or confirmed bookings can be cancelled' USING ERRCODE = 'P0001';
    END IF;
    IF v_reason IS NULL THEN
      RAISE EXCEPTION 'A cancellation reason is required' USING ERRCODE = '22023';
    END IF;
    UPDATE public.reservations
       SET status = 'CANCELLED', status_reason = v_reason, status_changed_by = v_actor, updated_at = now()
     WHERE id = r.id RETURNING * INTO r;

  ELSE
    RAISE EXCEPTION 'Unknown action' USING ERRCODE = '22023';
  END IF;

  RETURN r;
END;
$$;

REVOKE ALL ON FUNCTION public.bookify_owner_update_reservation(BIGINT, BIGINT, BOOLEAN, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bookify_owner_update_reservation(BIGINT, BIGINT, BOOLEAN, TEXT, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 5. Business reviews (1-5 stars) and platform testimonials
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.business_reviews (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  business_id BIGINT NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT CHECK (comment IS NULL OR length(comment) BETWEEN 3 AND 800),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_business_reviews_business
  ON public.business_reviews (business_id, created_at DESC);
ALTER TABLE public.business_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_reviews FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.platform_reviews (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL CHECK (length(comment) BETWEEN 10 AND 600),
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_platform_reviews_published
  ON public.platform_reviews (is_published, created_at DESC);
ALTER TABLE public.platform_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_reviews FROM PUBLIC, anon, authenticated;

-- Average and count per business (read by the API with the service role)
CREATE OR REPLACE VIEW public.business_rating_summary
WITH (security_invoker = true) AS
SELECT business_id,
       round(avg(rating)::numeric, 2) AS average_rating,
       count(*)::INT AS review_count
  FROM public.business_reviews
 GROUP BY business_id;
REVOKE ALL ON public.business_rating_summary FROM PUBLIC, anon, authenticated;
