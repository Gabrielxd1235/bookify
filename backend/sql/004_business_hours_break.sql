-- BOOKIFY - Split shifts
-- Lets a business close for a break in the middle of the day (for example
-- 09:00-13:00 and 15:00-19:00). Additive and idempotent: days without a
-- break keep working exactly as before. Safe to run more than once.

-- 1. Optional daily break -------------------------------------------------------

ALTER TABLE public.business_hours
    ADD COLUMN IF NOT EXISTS break_starts_at TIME,
    ADD COLUMN IF NOT EXISTS break_ends_at   TIME;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'business_hours_valid_break') THEN
        ALTER TABLE public.business_hours ADD CONSTRAINT business_hours_valid_break
            CHECK (
                (break_starts_at IS NULL AND break_ends_at IS NULL)
                OR (
                    is_closed = FALSE
                    AND break_starts_at IS NOT NULL
                    AND break_ends_at IS NOT NULL
                    AND opens_at < break_starts_at
                    AND break_starts_at < break_ends_at
                    AND break_ends_at < closes_at
                )
            );
    END IF;
END;
$$;

-- 2. Appointment functions respect the break ------------------------------------
-- The existing function bodies are patched in place: the schedule lookup also
-- loads the break, slots that touch it are not offered, and a reservation that
-- overlaps it is rejected.

DO $$
DECLARE
    v_name TEXT;
    v_def TEXT;
    v_new TEXT;
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
        CONTINUE WHEN position('break_starts_at' IN v_def) > 0;

        IF regexp_count(v_def, 'is_closed\s+INTO v_hours') <> 1 THEN
            RAISE EXCEPTION 'Function public.% does not load its schedule as expected; not patched', v_name;
        END IF;

        v_new := regexp_replace(
            v_def,
            '(\S*)is_closed(\s+INTO v_hours)',
            '\1is_closed, \1break_starts_at, \1break_ends_at\2'
        );

        IF v_name = 'get_available_slots' THEN
            IF regexp_count(v_new, 'ORDER BY c\.local_start') <> 1 THEN
                RAISE EXCEPTION 'Function public.get_available_slots has an unexpected shape; not patched';
            END IF;

            v_new := replace(
                v_new,
                'ORDER BY c.local_start',
                'AND (v_hours.break_starts_at IS NULL'
                || ' OR c.local_end::TIME <= v_hours.break_starts_at'
                || ' OR c.local_start::TIME >= v_hours.break_ends_at)'
                || E'\n    ORDER BY c.local_start'
            );
        ELSE
            IF regexp_count(v_new, '-- 14\. Prevent overlapping reservations') <> 1 THEN
                RAISE EXCEPTION 'Function public.create_pending_reservation has an unexpected shape; not patched';
            END IF;

            v_new := replace(
                v_new,
                '-- 14. Prevent overlapping reservations',
                E'-- 13b. Appointments cannot run into the daily break\n'
                || E'    IF v_hours.break_starts_at IS NOT NULL\n'
                || E'       AND v_local_start::TIME < v_hours.break_ends_at\n'
                || E'       AND v_local_end::TIME > v_hours.break_starts_at\n'
                || E'    THEN\n'
                || E'        RAISE EXCEPTION\n'
                || E'            USING ERRCODE = ''B4001'',\n'
                || E'                  MESSAGE = ''Reservation overlaps the business break'';\n'
                || E'    END IF;\n\n'
                || '    -- 14. Prevent overlapping reservations'
            );
        END IF;

        EXECUTE v_new;
    END LOOP;
END;
$$;
