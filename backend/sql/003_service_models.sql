-- BOOKIFY - Service models
-- Lets a business sell more than timed appointments:
--   APPOINTMENT   a time slot with a duration (existing behaviour, default)
--   SUBSCRIPTION  a membership billed per period (week / month / quarter / year)
--   PACKAGE       a bundle of sessions valid for a number of days
--   DAY_PASS      access for one full day
--
-- Additive and idempotent: existing services and reservations keep working as
-- APPOINTMENT rows. Safe to run more than once.

-- 1. Service catalogue -------------------------------------------------------

ALTER TABLE public.services
    ADD COLUMN IF NOT EXISTS service_type      VARCHAR(20) NOT NULL DEFAULT 'APPOINTMENT',
    ADD COLUMN IF NOT EXISTS billing_period    VARCHAR(10),
    ADD COLUMN IF NOT EXISTS sessions_included INTEGER,
    ADD COLUMN IF NOT EXISTS validity_days     INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_service_type_check') THEN
        ALTER TABLE public.services ADD CONSTRAINT services_service_type_check
            CHECK (service_type IN ('APPOINTMENT', 'SUBSCRIPTION', 'PACKAGE', 'DAY_PASS'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_billing_period_check') THEN
        ALTER TABLE public.services ADD CONSTRAINT services_billing_period_check
            CHECK (billing_period IS NULL OR billing_period IN ('WEEK', 'MONTH', 'QUARTER', 'YEAR'));
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_sessions_included_check') THEN
        ALTER TABLE public.services ADD CONSTRAINT services_sessions_included_check
            CHECK (sessions_included IS NULL OR sessions_included BETWEEN 1 AND 500);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_validity_days_check') THEN
        ALTER TABLE public.services ADD CONSTRAINT services_validity_days_check
            CHECK (validity_days IS NULL OR validity_days BETWEEN 1 AND 730);
    END IF;

    -- A subscription needs its billing period and a package its session count
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_model_fields_check') THEN
        ALTER TABLE public.services ADD CONSTRAINT services_model_fields_check
            CHECK (
                (service_type <> 'SUBSCRIPTION' OR billing_period IS NOT NULL)
                AND (service_type <> 'PACKAGE' OR sessions_included IS NOT NULL)
            );
    END IF;
END;
$$;

-- 2. Reservations remember which model was bought ----------------------------

ALTER TABLE public.reservations
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'APPOINTMENT';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'reservations_kind_check') THEN
        ALTER TABLE public.reservations ADD CONSTRAINT reservations_kind_check
            CHECK (kind IN ('APPOINTMENT', 'SUBSCRIPTION', 'PACKAGE', 'DAY_PASS'));
    END IF;
END;
$$;

-- 3. Appointment functions only look at appointments --------------------------
-- A month-long membership must not block every time slot of the business, and
-- the slot functions must refuse services that are not sold by time slot.
-- The existing function bodies are patched in place (two small edits each)
-- instead of being rewritten, so the rest of their logic stays untouched.

DO $$
DECLARE
    v_name TEXT;
    v_def TEXT;
    v_overlap CONSTANT TEXT := 'WHERE r.business_id = v_business_id';
    v_service CONSTANT TEXT := 'WHERE s.id = p_service_id';
BEGIN
    FOREACH v_name IN ARRAY ARRAY['create_pending_reservation', 'get_available_slots']
    LOOP
        SELECT pg_get_functiondef(p.oid)
          INTO v_def
          FROM pg_proc AS p
         WHERE p.pronamespace = 'public'::regnamespace
           AND p.proname = v_name;

        IF v_def IS NULL THEN
            RAISE EXCEPTION 'Function public.% was not found', v_name;
        END IF;

        -- Already patched by a previous run
        CONTINUE WHEN position('r.kind = ''APPOINTMENT''' IN v_def) > 0;

        IF (length(v_def) - length(replace(v_def, v_overlap, ''))) / length(v_overlap) <> 1
           OR (length(v_def) - length(replace(v_def, v_service, ''))) / length(v_service) <> 1
        THEN
            RAISE EXCEPTION 'Function public.% does not have the expected shape; not patched', v_name;
        END IF;

        v_def := replace(v_def, v_overlap,
            v_overlap || ' AND r.kind = ''APPOINTMENT''');

        v_def := replace(v_def, v_service,
            v_service || ' AND s.service_type = ''APPOINTMENT''');

        EXECUTE v_def;
    END LOOP;
END;
$$;

-- 4. Buying a subscription, package or day pass -------------------------------

CREATE OR REPLACE FUNCTION public.create_pending_purchase(
    p_user_id BIGINT,
    p_service_id BIGINT,
    p_start_date DATE,
    p_notes TEXT DEFAULT NULL
)
RETURNS public.reservations
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_service public.services%ROWTYPE;
    v_today DATE := (NOW() AT TIME ZONE 'America/Lima')::DATE;
    v_local_start TIMESTAMP;
    v_starts_at TIMESTAMPTZ;
    v_ends_at TIMESTAMPTZ;
    v_total NUMERIC(12,2);
    v_deposit NUMERIC(12,2);
    v_reservation public.reservations%ROWTYPE;
BEGIN

    -- 1. Validate the customer account
    IF NOT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = p_user_id
          AND role IN ('CLIENT', 'BUSINESS_OWNER')
          AND is_active = TRUE
    ) THEN
        RAISE EXCEPTION
            USING ERRCODE = 'B4040',
                  MESSAGE = 'Active client not found';
    END IF;

    -- 2. Validate the start date (Peru local calendar)
    IF p_start_date IS NULL
       OR p_start_date < v_today
       OR p_start_date > v_today + 90
    THEN
        RAISE EXCEPTION
            USING ERRCODE = 'B4001',
                  MESSAGE = 'Start date must be within the next 90 days';
    END IF;

    -- 3. Load the active service and business
    SELECT s.*
      INTO v_service
      FROM public.services AS s
      INNER JOIN public.businesses AS b
          ON b.id = s.business_id
     WHERE s.id = p_service_id
       AND s.is_active = TRUE
       AND b.is_active = TRUE;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            USING ERRCODE = 'B4040',
                  MESSAGE = 'Active service not found';
    END IF;

    IF v_service.service_type = 'APPOINTMENT' THEN
        RAISE EXCEPTION
            USING ERRCODE = 'B4001',
                  MESSAGE = 'This service is booked by choosing a time slot';
    END IF;

    IF v_service.price IS NULL OR v_service.price <= 0 THEN
        RAISE EXCEPTION
            USING ERRCODE = 'B4001',
                  MESSAGE = 'Invalid service price';
    END IF;

    IF LENGTH(COALESCE(p_notes, '')) > 500 THEN
        RAISE EXCEPTION
            USING ERRCODE = 'B4001',
                  MESSAGE = 'Reservation notes cannot exceed 500 characters';
    END IF;

    -- 4. Coordinate with other reservation operations of this business
    PERFORM pg_advisory_xact_lock(v_service.business_id);

    UPDATE public.reservations
       SET status = 'EXPIRED',
           updated_at = NOW()
     WHERE business_id = v_service.business_id
       AND status = 'PENDING_PAYMENT'
       AND payment_expires_at <= NOW();

    -- 5. Work out the validity period
    -- A purchase that starts today begins shortly after the payment window,
    -- because a deposit can only confirm a reservation that has not started.
    v_local_start := GREATEST(
        p_start_date::TIMESTAMP,
        (NOW() AT TIME ZONE 'America/Lima') + INTERVAL '20 minutes'
    );

    v_starts_at := v_local_start AT TIME ZONE 'America/Lima';

    v_ends_at := CASE v_service.service_type
        WHEN 'SUBSCRIPTION' THEN
            (v_local_start + CASE v_service.billing_period
                WHEN 'WEEK' THEN INTERVAL '7 days'
                WHEN 'QUARTER' THEN INTERVAL '3 months'
                WHEN 'YEAR' THEN INTERVAL '1 year'
                ELSE INTERVAL '1 month'
            END) AT TIME ZONE 'America/Lima'
        WHEN 'PACKAGE' THEN
            (v_local_start + MAKE_INTERVAL(days => COALESCE(v_service.validity_days, 90)))
                AT TIME ZONE 'America/Lima'
        ELSE
            -- DAY_PASS: valid until the end of the chosen day
            ((p_start_date + 1)::TIMESTAMP) AT TIME ZONE 'America/Lima'
    END;

    -- A day pass bought minutes before midnight still gets a usable window
    v_ends_at := GREATEST(v_ends_at, v_starts_at + INTERVAL '1 hour');

    -- 6. One active plan per client, service and period
    IF EXISTS (
        SELECT 1
        FROM public.reservations AS r
        WHERE r.user_id = p_user_id
          AND r.service_id = p_service_id
          AND r.kind <> 'APPOINTMENT'
          AND (
              r.status = 'CONFIRMED'
              OR (
                  r.status = 'PENDING_PAYMENT'
                  AND r.payment_expires_at > NOW()
              )
          )
          AND r.starts_at < v_ends_at
          AND r.ends_at > v_starts_at
    ) THEN
        RAISE EXCEPTION
            USING ERRCODE = 'B4090',
                  MESSAGE = 'You already have this plan for the selected dates';
    END IF;

    -- 7. Calculate the required 50% deposit
    v_total := ROUND(v_service.price, 2);
    v_deposit := ROUND(v_total * 0.50, 2);

    -- 8. Create the pending purchase
    INSERT INTO public.reservations (
        user_id,
        service_id,
        business_id,
        kind,
        starts_at,
        ends_at,
        status,
        notes,
        total_amount,
        deposit_amount,
        balance_amount,
        currency,
        payment_expires_at
    )
    VALUES (
        p_user_id,
        p_service_id,
        v_service.business_id,
        v_service.service_type,
        v_starts_at,
        v_ends_at,
        'PENDING_PAYMENT',
        NULLIF(TRIM(p_notes), ''),
        v_total,
        v_deposit,
        v_total - v_deposit,
        'PEN',
        NOW() + INTERVAL '15 minutes'
    )
    RETURNING *
    INTO v_reservation;

    RETURN v_reservation;

END;
$function$;

-- Same exposure as the other reservation functions: backend only
REVOKE ALL ON FUNCTION public.create_pending_purchase(BIGINT, BIGINT, DATE, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_pending_purchase(BIGINT, BIGINT, DATE, TEXT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_purchase(BIGINT, BIGINT, DATE, TEXT) TO service_role;
