-- BOOKIFY 007 - Welcome offer: 25% off the first booking or purchase.
-- Applied by the database when the reservation is created, so every path
-- (appointments, subscriptions, packages, day passes) gets it and the
-- browser can never set its own price. A client qualifies while they have no
-- confirmed/completed/no-show booking and no other discounted booking still
-- waiting for payment. If the discounted booking expires or is cancelled,
-- the offer is available again. Additive and idempotent.

ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS discount_percent SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_discount_percent_check') THEN
    ALTER TABLE public.reservations ADD CONSTRAINT reservations_discount_percent_check
      CHECK (discount_percent BETWEEN 0 AND 90);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.bookify_first_booking_eligible(p_user_id BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.reservations r
     WHERE r.user_id = p_user_id
       AND (r.status IN ('CONFIRMED', 'COMPLETED', 'NO_SHOW')
            OR (r.status = 'PENDING_PAYMENT' AND r.discount_percent > 0 AND r.payment_expires_at > now()))
  );
$$;

CREATE OR REPLACE FUNCTION public.bookify_apply_first_booking_offer()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_percent CONSTANT SMALLINT := 25;
BEGIN
  IF NEW.total_amount IS NOT NULL AND NEW.total_amount > 0
     AND NEW.status = 'PENDING_PAYMENT'
     AND public.bookify_first_booking_eligible(NEW.user_id) THEN
    NEW.original_amount := NEW.total_amount;
    NEW.discount_percent := v_percent;
    NEW.total_amount := round(NEW.total_amount * (100 - v_percent) / 100.0, 2);
    NEW.deposit_amount := round(NEW.total_amount * 0.50, 2);
    NEW.balance_amount := NEW.total_amount - NEW.deposit_amount;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bookify_first_booking_offer ON public.reservations;
CREATE TRIGGER trg_bookify_first_booking_offer
  BEFORE INSERT ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.bookify_apply_first_booking_offer();

REVOKE ALL ON FUNCTION public.bookify_first_booking_eligible(BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bookify_first_booking_eligible(BIGINT) TO service_role;
