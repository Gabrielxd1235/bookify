-- =====================================================================
-- BOOKIFY - Borrar SOLO las cuentas de prueba de carga
-- Ejecutar en Supabase -> SQL Editor, en dos pasos (1 y 2).
--
-- Se borran unicamente usuarios que cumplen TODO esto:
--   * role = 'CLIENT'                       (nunca ADMIN ni BUSINESS_OWNER)
--   * email de prueba generado por scripts:
--       loadtest-reg%@example.test   (pruebas de registro k6: una a una y por lotes)
--   Las cuentas del seeder (loadtest-<run>-NNNNN, sin "reg") se CONSERVAN: son las
--   5000 cuentas con contrasena conocida que usan las pruebas de login. Para
--   borrarlas tambien, cambiar 'loadtest-reg%' por 'loadtest-%'.
--       k6.bookify.%@example.com     (prueba de registro antigua, 26/10/2026)
--   * sin reservas, sin pagos y sin negocios a su nombre
-- Sus refresh_tokens y solicitudes de dueno se borran solos (ON DELETE CASCADE).
-- Las cuentas reales (gmail, tecsup, bookify.test, etc.) no se tocan.
-- =====================================================================


-- ---------------------------------------------------------------------
-- PASO 1 - Vista previa (solo lectura). Revisar antes de borrar.
-- ---------------------------------------------------------------------
WITH objetivo AS (
  SELECT u.id
  FROM public.users u
  WHERE u.role = 'CLIENT'
    AND (u.email LIKE 'loadtest-reg%@example.test'
         OR u.email LIKE 'k6.bookify.%@example.com')
    AND NOT EXISTS (SELECT 1 FROM public.reservations r WHERE r.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.bookify_mock_deposit_payments p WHERE p.user_id = u.id)
    AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = u.id)
)
SELECT
  (SELECT count(*) FROM objetivo)                                   AS se_borraran,
  (SELECT count(*) FROM public.users)                               AS usuarios_total,
  (SELECT count(*) FROM public.users WHERE role = 'ADMIN')          AS admins_se_conservan,
  (SELECT count(*) FROM public.users WHERE role = 'BUSINESS_OWNER') AS owners_se_conservan,
  (SELECT count(*) FROM public.users) - (SELECT count(*) FROM objetivo) AS quedaran;


-- ---------------------------------------------------------------------
-- PASO 2 - Borrado. Seleccionar desde BEGIN hasta COMMIT y ejecutar.
-- Si el numero de la verificacion no es el esperado, cambiar COMMIT
-- por ROLLBACK y no se borra nada.
-- ---------------------------------------------------------------------
BEGIN;

DELETE FROM public.users u
WHERE u.role = 'CLIENT'
  AND (u.email LIKE 'loadtest-reg%@example.test'
       OR u.email LIKE 'k6.bookify.%@example.com')
  AND NOT EXISTS (SELECT 1 FROM public.reservations r WHERE r.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.bookify_mock_deposit_payments p WHERE p.user_id = u.id)
  AND NOT EXISTS (SELECT 1 FROM public.businesses b WHERE b.owner_id = u.id);

-- Verificacion: debe quedar 0 cuentas de prueba y los mismos admins/owners
SELECT
  count(*) FILTER (WHERE email LIKE 'loadtest-reg%@example.test'
                      OR email LIKE 'k6.bookify.%@example.com') AS cuentas_prueba_restantes,
  count(*) FILTER (WHERE role = 'ADMIN')          AS admins,
  count(*) FILTER (WHERE role = 'BUSINESS_OWNER') AS owners,
  count(*)                                        AS usuarios_total
FROM public.users;

COMMIT;
