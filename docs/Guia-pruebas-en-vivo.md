# BOOKIFY – Guía de pruebas en vivo (Azure) · v3

Versión del 20/11/2026 para la presentación final (entrega del 100 %). Todas las pruebas
se ejecutan desde la laptop contra el sistema publicado en Azure; no hace falta levantar
nada en local. Cada bloque de código se copia entero y se pega en **PowerShell**.

**Qué cambió respecto a la v2:** prueba nueva de registro masivo de 100 000 a 500 000
cuentas con cantidad y tiempo a elección, demostración de pagos (50 % / 100 % / saldo),
columna *Reason* del dueño, reseñas, salud del servidor, logs estructurados y respuestas
nuevas para el ingeniero.

---

## 1. Antes de empezar (una vez)

Requisitos en la laptop:

- k6 instalado: `winget install k6 --source winget` (después, abrir una PowerShell nueva).
- Repositorio actualizado: `cd C:\Dev\bookify` y `git pull`.
- `C:\Dev\bookify\backend\.env` con las credenciales de Supabase (lo usa el contador de cuentas).
- `C:\Dev\bookify\backend\tests\load\private\bookify-users-latest.csv` con las 5000 cuentas de
  login (no está en GitHub porque tiene contraseñas).
- La clave de pruebas de carga (`$key`). No está en GitHub ni en este documento.

**Paso 1 – Variables** (se pierden al cerrar la ventana; repetir en cada PowerShell nueva):

```powershell
cd C:\Dev\bookify\backend\tests\load
$api = "https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io"
$key = "<clave de prueba de carga>"
```

**Paso 2 – Despertar la API.** Azure apaga el contenedor cuando nadie lo usa (mínimo 0
réplicas); la primera petición puede tardar más de 15 s. Este bucle espera a que responda
rápido:

```powershell
do { $t = Measure-Command { try { Invoke-RestMethod "$api/api/health" -TimeoutSec 60 | Out-Null } catch {} }; "health: {0:N1} s" -f $t.TotalSeconds; Start-Sleep 2 } while ($t.TotalSeconds -gt 2)
```

**Paso 3 – Comprobar la clave.** Debe salir solo `HTTP/1.1 200 OK`, sin líneas `ratelimit`:

```powershell
curl.exe -s -D - -o NUL -H "X-Load-Test-Key: $key" "$api/api/health" | Select-String "HTTP/|ratelimit"
```

Reglas durante la demostración:

- Una prueba a la vez.
- No iniciar sesión en BOOKIFY desde la misma red mientras corre una prueba de logins sin clave.
- No hacer `git push` a `main` durante una prueba: redespliega la API.

## 2. Dashboard de k6 en tiempo real

Pegar una vez en la misma ventana:

```powershell
Remove-Item Env:\K6_WEB_DASHBOARD_PORT, Env:\K6_WEB_DASHBOARD_EXPORT -ErrorAction SilentlyContinue
$env:K6_WEB_DASHBOARD = "true"
$env:K6_WEB_DASHBOARD_OPEN = "true"
$env:K6_WEB_DASHBOARD_PERIOD = "1s"
```

Cómo se usa:

1. La cabecera de k6 debe mostrar `web dashboard: http://127.0.0.1:5665`. Si sale vacía, volver a pegar el bloque de arriba.
2. Se abre sola una pestaña con el dashboard en vivo.
3. Al terminar la prueba, la pestaña se queda con los valores finales y la consola espera.
4. **Cerrar la pestaña**: la consola imprime el resumen y se guardan el HTML y el JSON. El `Start-Process` del final de cada comando abre el reporte HTML.

## 3. Prueba 1 – Paginado (~10 s)

```powershell
$env:K6_WEB_DASHBOARD_EXPORT = "results\vivo-paginado.html"
k6 run -e "BASE_URL=$api" --summary-export results\vivo-paginado.json bookify-pagination.js; Start-Process results\vivo-paginado.html
```

**Qué hace:** 5 usuarios virtuales piden 108 combinaciones de página y límite de categorías, negocios y servicios.

**Qué demuestra:** control de paginados con tiempos cómodos: todo HTTP 200, JSON válido y menos de 1,5 s.

**Resultado esperado:** 324/324 checks, 0 % de fallos, p95 de unos 600 ms.

## 4. Pruebas 2 y 3 – 1000 y 5000 peticiones autenticadas

```powershell
$env:K6_WEB_DASHBOARD_EXPORT = "results\vivo-1000.html"
k6 run -e "BASE_URL=$api" -e TOTAL_REQUESTS=1000 --summary-export results\vivo-1000.json bookify-5000-users.js; Start-Process results\vivo-1000.html
```

```powershell
$env:K6_WEB_DASHBOARD_EXPORT = "results\vivo-5000.html"
k6 run -e "BASE_URL=$api" -e TOTAL_REQUESTS=5000 --summary-export results\vivo-5000.json bookify-5000-users.js; Start-Process results\vivo-5000.html
```

**Qué hace:** inicia sesión con 50 cuentas reales del CSV y 50 usuarios virtuales envían las peticiones con su token (perfil, reservas, categorías, negocios y servicios).

**Qué demuestra:** la API atiende 1000 y 5000 peticiones autenticadas de 50 usuarios simultáneos sin errores.

**Qué NO demuestra:** 5000 logins; las 50 sesiones se reutilizan (para logins reales, prueba 4).

**Resultado esperado:** 2050/2050 y 10 050/10 050 checks, 0 % de fallos, p95 de la API por debajo de 500 ms.

## 5. Prueba 4 – Cuentas reales distintas (login + perfil + logout)

```powershell
$env:K6_WEB_DASHBOARD_EXPORT = "results\vivo-cuentas-300.html"
k6 run -e "BASE_URL=$api" -e VUS=5 -e ACCOUNT_COUNT=300 -e LOGIN_TIMEOUT=30s --summary-export results\vivo-cuentas-300.json bookify-auth-users.js; Start-Process results\vivo-cuentas-300.html
```

Con la clave, el límite de login no aplica y se pueden usar más usuarios simultáneos:
agregar `-e "LOAD_TEST_KEY=$key" -e VUS=50`.

**Qué demuestra:** que las cuentas existen en Supabase, que su contraseña cifrada con
bcrypt es válida y que cada token solo da acceso a su propio perfil.

## 6. Prueba 5 – Registro masivo de 100 000 a 500 000 cuentas (NUEVA)

Se ejecuta con un solo comando y **se elige libremente la cantidad y el tiempo**. Desde la
carpeta `backend`:

```powershell
cd C:\Dev\bookify\backend
```

| Parámetro | Qué controla | Valores |
|---|---|---|
| `-Accounts` | cuántas cuentas registrar | 1 a 500 000 |
| `-Seconds` | límite de tiempo (corta exactamente ahí) | 0 = sin límite, o 1 a 3600 |
| `-BatchSize` | cuentas por petición | 1 a 2000 (usar 2000) |
| `-VirtualUsers` | peticiones simultáneas | 20 por defecto con lotes; 30 para 500 000 |
| `-LoadTestKey` | clave de pruebas de carga | `$key` |

Ejemplos listos para pegar:

```powershell
# 100 000 cuentas, sin límite de tiempo
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 100000 -BatchSize 2000
```

```powershell
# 500 000 cuentas completas
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 500000 -BatchSize 2000 -VirtualUsers 30
```

```powershell
# Medio millón con límite de 10 segundos: ¿cuántas entran?
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 500000 -BatchSize 2000 -VirtualUsers 30 -Seconds 10
```

```powershell
# Cualquier combinación, por ejemplo 250 000 en 5 segundos
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 250000 -BatchSize 2000 -Seconds 5
```

**Qué hace:** cada petición lleva un lote de 2000 cuentas nuevas comprimido con gzip. El
servidor valida cada cuenta, cifra la contraseña con bcrypt (una vez por contraseña distinta
del lote) y guarda el lote completo con **una sola inserción** en Supabase. Al final el
script cuenta en Supabase cuántas quedaron guardadas (y cuántas dentro de los primeros N
segundos). Ese conteo es el número oficial: con límite de tiempo, las peticiones que ya
estaban en camino también se guardan.

**Al terminar se ve:**

```
Confirmadas por k6:        146000
Peticiones fallidas:       0,00 %
Guardadas en Supabase:     186000
Primera a ultima:          9.86 s
Guardadas en los primeros 10 s: 186000
```

Con `-Seconds` es normal que k6 marque los umbrales con ✗: la prueba se corta a propósito.

**Truco para la ventana de 10 s:** Azure tarda ~30 s en añadir réplicas (hasta 4). Para que
la prueba corta aproveche las 4, primero lanzar una corrida de calentamiento de ~30 s (por
ejemplo 500 000 sin límite) y enseguida la de 10 s. Las réplicas se mantienen 5 minutos.

**Qué demuestra (requisito del 100 %: pruebas con 100 000 – 500 000):** que el sistema en la
nube registra de punta a punta (k6 → API en Azure → Supabase) cientos de miles de cuentas
reales en segundos, sin errores, y que los cuellos de botella están controlados.

**Resultados de referencia (Azure, 20/11/2026, 0 % de fallos):**

| Configuración | Prueba | Resultado |
|---|---|---|
| 1 réplica | 100 000 cuentas | ~7,3 s (13 700 cuentas/s) |
| 1 réplica | 500 000 con 10 s | 186 000 guardadas |
| hasta 4 réplicas | 500 000 cuentas | 20,5 s (21 500/s); 340 000 en los primeros 10 s |

**Limpieza después de la prueba** (Supabase → SQL Editor). Las 5000 cuentas de login se
conservan. Con cientos de miles de filas, borrar por tandas; repetir hasta que diga 0:

```sql
WITH lote AS (SELECT id FROM users WHERE email LIKE 'loadtest-reg%@example.test' AND role = 'CLIENT' LIMIT 100000),
b AS (DELETE FROM users u USING lote WHERE u.id = lote.id RETURNING 1)
SELECT count(*) AS borrados FROM b;
```

Al terminar, liberar el espacio (ejecutar solo esta línea):

```sql
VACUUM (FULL, ANALYZE) public.users;
```

## 7. Prueba 6 – Seguridad (CORS, tokens, errores, límites)

```powershell
# CORS: un origen ajeno NO recibe access-control-allow-origin
curl.exe -s -D - -o NUL -H "Origin: https://evil.example" "$api/api/categories" | Select-String "HTTP/|access-control-allow-origin"

# CORS: el frontend de BOOKIFY sí está permitido
curl.exe -s -D - -o NUL -H "Origin: https://thankful-smoke-0adbf990f.4.azurestaticapps.net" "$api/api/categories" | Select-String "HTTP/|access-control-allow-origin"

# Ruta protegida sin token / token falso
curl.exe -s "$api/api/reservations/mine"
curl.exe -s -H "Authorization: Bearer token-falso" "$api/api/admin/users"

# La ruta de registro masivo no existe sin la clave
curl.exe -s -X POST -H "Content-Type: application/json" -d "{}" "$api/api/auth/register-batch"

# Errores controlados y página en desarrollo
curl.exe -s -o NUL -w "API 404: %{http_code}`n" "$api/api/no-existe"
curl.exe -s -o NUL -w "HTML 404: %{http_code}`n" "$api/no-existe"
curl.exe -s -o NUL -w "En desarrollo: %{http_code}`n" "$api/under-development"

# Límites activos (cuenta como 1 intento fallido de login)
curl.exe -s -D - -o NUL -X POST -H "Content-Type: application/json" -d "{}" "$api/api/auth/login" | Select-String "HTTP/|ratelimit:"
```

| Comprobación | Resultado esperado |
|---|---|
| Origen ajeno | `200 OK` sin `access-control-allow-origin` |
| Frontend de BOOKIFY | `access-control-allow-origin: https://thankful-smoke-...` |
| Sin token / token falso | `Authentication token required` / `Invalid or expired token` (401) |
| Registro masivo sin clave | `Route not found` (404) |
| Rutas inexistentes | `API 404: 404`, `HTML 404: 404` |
| En desarrollo | `En desarrollo: 200` |
| Login | `ratelimit: "10-in-3min"` y `"20000-in-15min"` |

## 8. Prueba 7 – Salud del servidor, logs y errores esperados (NUEVA)

**Salud y estado en vivo:**

```powershell
Invoke-RestMethod "$api/api/health/ready" | ConvertTo-Json -Depth 4
```

Muestra `status: READY`, la latencia de la base (`database.latencyMs`) y el estado del
servidor: peticiones en curso, pico, peticiones rechazadas por sobrecarga
(`shedRequests`), peticiones vencidas (`timedOutRequests`) y memoria. Si la base no responde
devuelve **503** con `reason: DATABASE_UNAVAILABLE` o `DATABASE_TIMEOUT`.

**Identificador de cada petición:**

```powershell
curl.exe -s -D - -o NUL "$api/api/health" | Select-String "x-request-id"
```

**Logs estructurados en vivo:** portal de Azure → `bookify-api` → **Supervisión →
Secuencia de registro**. Lanzar cualquier prueba y mostrar las líneas JSON
(`"msg":"http_request"`, `status`, `durationMs`, `requestId`). En **Registros** (Log Analytics):

```kusto
ContainerAppConsoleLogs_CL
| where ContainerAppName_s == "bookify-api"
| extend j = parse_json(Log_s)
| where j.msg == "http_request"
| summarize peticiones = count(), p95_ms = percentile(todouble(j.durationMs), 95) by tostring(j.status)
```

**Errores esperados que la API contiene** (respuesta 503 con `reason`, `message` y `requestId`):
`DATABASE_UNAVAILABLE`, `DATABASE_TIMEOUT`, `TIMEOUT` (más de 15 s), `SERVER_BUSY`
(más de 600 peticiones en curso, con `Retry-After`) y `SERVER_RESTARTING` (durante un
despliegue). Los errores inesperados devuelven 500 `INTERNAL_ERROR` y el detalle queda solo en el log.

## 9. Demostración funcional (navegador)

Sitio: https://thankful-smoke-0adbf990f.4.azurestaticapps.net

1. **Portada:** sección *What our users say* con las opiniones y el promedio de estrellas;
   tarjetas de locales con logo, foto y calificación.
2. **Página de un local** (p. ej. Zen Garden Spa): logo, galería, servicios por cita,
   suscripción, paquete o pase diario, horarios y **Ratings & reviews**.
3. **Reservar** con una cuenta de cliente: el checkout da **5 minutos** y dos opciones:
   *Pay 50% now* (el resto en el local) o *Pay 100% online*.
4. Con el 50 % pagado, en la confirmación o en *My bookings* aparece **Pay balance online**.
5. **Dueño → Bookings received:** columnas *Paid*, *Status* y **Reason** (por qué la reserva
   está así) y las acciones *Balance paid in store*, *Mark completed*, *No-show* y *Cancel*
   (con motivo obligatorio).
6. Después de pagar, el cliente puede **calificar el local** (reseña verificada).

## 10. Monitoreo en Azure

Portal → **Panel** → *BOOKIFY pruebas de carga*: peticiones por código de respuesta, CPU y
memoria, réplicas y reinicios. Se actualiza cada 5 min; los datos tardan 1–3 min en aparecer.
Durante la prueba de 500 000 se ve subir el número de réplicas (hasta 4).

## 11. Respuestas preparadas para el ingeniero

**¿Cuántos usuarios soporta?** En la prueba de registro, 500 000 cuentas en 20,5 s y
340 000 en los primeros 10 s, con 0 % de fallos. El techo lo pone la escritura en
PostgreSQL (~21 000–25 000 filas por segundo).

**¿Son cuentas reales y persistentes?** Sí: se guardan en la tabla `users` de Supabase,
cada una con email único y contraseña cifrada con bcrypt; se cuentan con SQL al final. Son
identidades de prueba (`@example.test`), por eso después se limpian.

**¿Cuáles eran los cuellos de botella y cómo se controlaron?**

| Cuello de botella | Solución |
|---|---|
| bcrypt usa mucha CPU (150 registros/s) | un hash por contraseña distinta del lote; costo 4 solo para cuentas sintéticas, las reales siguen con 12 |
| una petición y un INSERT por cuenta | lotes de 2000 cuentas en una petición y un INSERT |
| subida de datos desde la laptop | cuerpo comprimido con gzip (10 veces menos datos) |
| una sola réplica de 0,5 vCPU | escalado horizontal hasta 4 réplicas |
| saturación | *load shedding*: 503 inmediato con más de 600 peticiones en curso |
| base lenta | límite de 10 s por consulta y 15 s por petición |

**¿Se debilitó la seguridad para las pruebas?** No para los usuarios reales. Solo las
peticiones con la clave de prueba (se guarda únicamente su huella SHA-256) se saltan los
límites, y solo aceptan cuentas `loadtest-*@example.test` como CLIENT. Sin la clave, la ruta
de lotes responde 404. Después de la entrega se desactiva con `LOAD_TEST_KEY_SHA256=off`.

**¿Cómo funcionan los pagos?** Simulados: 50 % online y el resto en el local, o 100 %
online; el saldo se puede pagar online después. El servidor calcula el monto (si el
navegador manda un monto, se rechaza) y la reserva vence a los 5 minutos si no se paga.

**¿Qué pasa si se cae el servidor?** La API responde 503 con el motivo, cada petición tiene
tiempo máximo, al redesplegar termina las peticiones en curso, y Azure reinicia el
contenedor. `/api/health/ready` dice en qué estado está.

**¿Cómo se despliega? (CI/CD)** Cada push ejecuta 34 tests del backend, la imagen Docker,
los tests y el build del frontend y la validación de los scripts de k6. La API solo se
despliega si pasan los tests, y después se comprueba `/api/health/ready`.

**¿Cómo migrarían de servidor sin perder servicio?** Revisiones blue-green de Container
Apps con tráfico gradual y rollback en segundos; para otro proveedor, la misma imagen
Docker en paralelo y cambio de tráfico por DNS/Front Door; para la base, replicación lógica
con una pausa de escrituras de segundos. Detalle en `docs/Estrategia-migracion-servidor.md`.

**¿La base de datos está en Azure?** No: frontend y API están en Azure y PostgreSQL en
Supabase. Cada petición de las pruebas viaja de Azure a Supabase en tiempo real.

## 12. Si algo falla en vivo

| Síntoma | Causa | Solución inmediata |
|---|---|---|
| `request timeout` en las primeras peticiones | arranque en frío del contenedor | repetir el paso 2 y lanzar de nuevo |
| `web dashboard:` vacío, se abre una carpeta o `ERR_CONNECTION_REFUSED` | quedó `K6_WEB_DASHBOARD_PORT=-1` en la consola | volver a pegar el bloque de la sección 2 o abrir una PowerShell nueva |
| La consola se queda en `running ... complete` | la pestaña del dashboard sigue abierta (es lo esperado) | cerrar la pestaña |
| `La API no reconoce la clave` | `$key` vacía o incorrecta | revisar el paso 1 y el paso 3 |
| `Authentication failed: HTTP 429` | demasiados logins sin clave desde la misma IP | esperar 3 minutos o usar `-e "LOAD_TEST_KEY=$key"` |
| `open ./private/...csv: no such file` | falta el CSV o la ventana no está en `backend\tests\load` | revisar el paso 1 |
| Muchos 503 `SERVER_BUSY` | demasiadas peticiones simultáneas | bajar `-VirtualUsers` (20) |
| `k6` no se reconoce | k6 recién instalado | abrir una PowerShell nueva |

## 13. Resultados de referencia en Azure

| Prueba | Fecha | Usuarios virtuales | Resultado | p95 / tiempo |
|---|---|---|---|---|
| Paginado | 15/11/2026 | 5 | 324/324 checks, 0 % fallos | 576 ms |
| Carga 1000 | 15/11/2026 | 50 | 2050/2050 checks, 0 % fallos | 470 ms |
| Carga 5000 | 15/11/2026 | 50 | 10 050/10 050 checks, 0 % fallos | 330 ms |
| Cuentas distintas (300) | 15/11/2026 | 5 | 1200/1200 checks, 0 % fallos | 2,6 s |
| Registro 100 000 | 20/11/2026 | 20 | 100 000 cuentas, 0 % fallos | 7,3 s |
| Registro 500 000 con 10 s | 20/11/2026 | 20 | 186 000 guardadas (1 réplica) | 10 s |
| Registro 500 000 | 20/11/2026 | 30 | 500 000 cuentas, 0 % fallos (hasta 4 réplicas) | 20,5 s |
