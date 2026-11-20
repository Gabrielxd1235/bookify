# BOOKIFY – Entrega del 100 %

Resumen de lo que cubre cada punto de la rúbrica y dónde está en el código.

## 1. Proyecto funcional al 100 %

| Funcionalidad nueva | Dónde |
|---|---|
| **Pago simulado en dos modalidades**: 50 % online + 50 % en el local, o 100 % online | `Checkout.jsx`, `mock-checkout.controller.js`, función SQL `bookify_pay_mock` |
| **Pagar el saldo online** después de haber pagado el 50 % | `POST /api/mock-checkout/reservations/:id/pay-balance` |
| **Ventana de pago de 5 minutos** (antes 15) | migración `005_payment_plans_reasons_reviews.sql` |
| **Bookings received del dueño**: columnas *Paid* y *Reason* (motivo) y acciones: saldo pagado en el local, completada, no asistió, cancelar con motivo | `Owner.jsx`, `PATCH /api/reservations/:id/manage`, función SQL `bookify_owner_update_reservation` |
| **Motivo de cada reserva** (falta pagar, no pagó a tiempo, cancelada por el cliente/negocio y por qué, 50 % pagado y saldo en tienda, pagada completa…) | `reservation-details.utils.js` → `describeReservation` |
| **Reseñas con estrellas por negocio** (solo clientes con reserva confirmada: "Verified booking") | `Reviews.jsx`, `review.controller.js`, tabla `business_reviews` |
| **Opiniones de los usuarios sobre BOOKIFY** en la portada | `PlatformTestimonials`, tabla `platform_reviews` |
| **13 locales nuevos** con logo, portada, galería (fotos Unsplash), horarios y servicios por cita, suscripción, paquete y pase diario | `scripts/seed-demo-businesses.cjs` |

## 2. Pruebas en el servidor con 100 000 – 500 000 usuarios

Prueba: registro por lotes (`bookify-register-batch.js`) contra la API de Azure.
Cada lote de 2000 cuentas viaja comprimido con gzip, el servidor valida cada cuenta,
cifra la contraseña con bcrypt (una vez por contraseña distinta del lote) y guarda el
lote con **una sola inserción**. El conteo oficial sale de Supabase.

```powershell
cd C:\Dev\bookify\backend
# 100 000 cuentas
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 100000 -BatchSize 2000 -VirtualUsers 20
# 500 000 cuentas con límite de 10 segundos (¿cuántas entran?)
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 500000 -BatchSize 2000 -VirtualUsers 20 -Seconds 10
```

Resultados medidos contra Azure el 20/11/2026 (0 % de fallos en todas):

| Azure | Prueba | Resultado |
|---|---|---|
| 0,5 vCPU, 1 réplica | 100 000 cuentas | 100 000 en ~7,3 s (13 700 cuentas/s) |
| 0,5 vCPU, 1 réplica | 500 000 con límite de 10 s | 186 000 guardadas en Supabase en 10 s |
| 0,5 vCPU, hasta 4 réplicas | 500 000 cuentas | 500 000 en 20,5 s (21 500/s); 340 000 en los primeros 10 s |

Después de la prueba, borrar las cuentas con `backend/sql/cleanup-load-test-users.sql`
(conserva las 5000 cuentas sembradas para las pruebas de login).

## 3. Control de cuellos de botella

| Cuello de botella | Cómo se detectó | Cómo se controla |
|---|---|---|
| bcrypt (CPU) en cada registro | 0,5 vCPU ≈ 150 registros/s | lotes: un hash por contraseña distinta; costo 4 solo para cuentas sintéticas `@example.test`; las reales siguen con 12 |
| Un viaje HTTP + un INSERT por cuenta | 50 cuentas en 2 s | lotes de hasta 2000 cuentas en una petición y un INSERT |
| Subida de datos desde el generador | lotes de ~200 KB | cuerpo comprimido con gzip (~10 veces menos datos) |
| Escritura en PostgreSQL | ~23 000 filas/s medidas | INSERT sin `RETURNING`; el límite de la base marca el techo real |
| Saturación de la API | lotes vencidos con 20 VU en 0,5 vCPU | **load shedding**: con más de 600 peticiones en curso responde 503 `SERVER_BUSY` al instante; escalado horizontal de Container Apps |
| Base lenta o caída | peticiones colgadas | cada consulta tiene **10 s de límite** (`DB_TIMEOUT_MS`); cada petición, **15 s** (`REQUEST_TIMEOUT_MS`) |
| Fuerza bruta / abuso | — | rate limit de login (10/3 min por IP), registro (5/h por IP) y global (20 000/15 min) |

`GET /api/health/ready` muestra en vivo: peticiones en curso, pico, peticiones rechazadas
por sobrecarga, peticiones vencidas, memoria y latencia de la base.

## 4. Logs estructurados

Cada línea de log es un objeto JSON (`backend/src/utils/logger.js`):

```json
{"ts":"2026-11-20T08:19:52.516Z","level":"info","service":"bookify-api","msg":"http_request","requestId":"fb83…","method":"GET","route":"/api/businesses/:id/reviews","status":200,"durationMs":204.5,"inFlight":1}
```

- Una línea por petición (`http_request`) con `requestId`, ruta, estado, duración, usuario y rol.
- Nivel `warn` para 4xx y peticiones lentas (> 1,5 s), `error` para 5xx.
- Eventos: `server_started`, `load_shed`, `request_timeout`, `dependency_failure`, `readiness_failed`, `shutdown_started`, `uncaught_exception`.
- Cada respuesta lleva la cabecera `X-Request-Id`, para encontrar su línea de log.

En Azure: **bookify-api → Supervisión → Registros** (Log Analytics):

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "bookify-api"
| extend j = parse_json(Log_s)
| where j.msg == "http_request" and toint(j.status) >= 500
| project TimeGenerated, j.requestId, j.route, j.status, j.durationMs
```

## 5. Errores esperados y caídas

| Situación | Respuesta | Mensaje al usuario |
|---|---|---|
| Base inaccesible | 503 `DATABASE_UNAVAILABLE` + `Retry-After` | "BOOKIFY cannot reach its database right now…" |
| Base lenta | 503 `DATABASE_TIMEOUT` | "The database took too long to answer…" |
| Petición que no termina en 15 s | 503 `TIMEOUT` | indica el límite y que se reintente |
| Servidor saturado | 503 `SERVER_BUSY` + `Retry-After: 2` | "too many requests right now…" |
| Despliegue en curso | 503 `SERVER_RESTARTING` | "restarting for an update…" |
| Error inesperado | 500 `INTERNAL_ERROR` + `requestId` | el detalle queda solo en el log |
| Proceso que se cae | log `uncaught_exception` y apagado ordenado; Azure lo reinicia | — |

Todas las respuestas de error incluyen `reason` y `requestId`.

## 6. Extra: pipeline CI/CD

- `.github/workflows/ci.yml`: en cada push y pull request ejecuta los tests del backend
  (34), revisa la sintaxis, construye la imagen Docker, ejecuta los tests y el build del
  frontend y valida los scripts de k6.
- Despliegue de la API: primero corre los tests; si pasan, construye la imagen, la
  publica en GHCR, crea la revisión en Azure y **comprueba `/api/health/ready`**.
- Despliegue del frontend: Azure Static Web Apps en cada push a `main`.

## 7. Extra: migración de servidor sin pérdida de servicio

Ver `docs/Estrategia-migracion-servidor.md` (blue-green con revisiones, mudanza a otro
proveedor con DNS/Front Door y migración de base con replicación lógica).
