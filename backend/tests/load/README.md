# BOOKIFY – Pruebas de carga con k6 contra Azure

La guía completa (instalación, variables de entorno, pruebas locales, Docker,
interpretación y limpieza) es **`docs/Guia-Ejecucion-Pruebas-BOOKIFY.docx`**.
Este archivo solo añade lo necesario para correr las mismas pruebas **contra el
servidor de Azure**, que es lo que pide la rúbrica del 80 % ("pruebas de test en el
servidor, 1000 – 5000").

API de Azure: `https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io`

## 1. Antes de empezar (cualquier equipo)

1. Instalar k6: `winget install k6 --source winget` (Windows), `brew install k6` (macOS).
   Abrir una terminal nueva después de instalarlo.
2. `git pull` del repositorio.
3. Copiar los CSV de cuentas a `backend/tests/load/private/` (no están en GitHub porque
   tienen contraseñas):
   - `bookify-users-mwinc5qd566ff647.csv` – 5000 cuentas
   - `bookify-users-mwinewgu4f2daf9a.csv` – 1000 cuentas
4. Ejecutar los comandos k6 desde `backend/tests/load`.

Los scripts ya usan esos dos CSV por defecto, así que `USERS_FILE` es opcional.

## 2. Comandos contra Azure

Los parámetros `-e` son iguales en Windows, macOS y Linux. En PowerShell, defina antes
el dashboard con `$env:K6_WEB_DASHBOARD="true"; $env:K6_WEB_DASHBOARD_EXPORT="results/<nombre>.html"`;
en bash/zsh, anteponga `K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=results/<nombre>.html`.

Paginado (108 peticiones, ~11 s):

```
k6 run -e BASE_URL=https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io bookify-pagination.js
```

Carga de 1000 peticiones autenticadas (50 usuarios virtuales, ~40 s):

```
k6 run -e BASE_URL=https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io -e TOTAL_REQUESTS=1000 bookify-5000-users.js
```

Carga de 5000 peticiones autenticadas (50 usuarios virtuales, ~65 s):

```
k6 run -e BASE_URL=https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io -e TOTAL_REQUESTS=5000 bookify-5000-users.js
```

Verificación de cuentas distintas (login + perfil + logout por cuenta). Contra Azure
use `LOGIN_TIMEOUT=30s` y 5 usuarios virtuales o menos:

```
k6 run -e BASE_URL=https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io -e VUS=5 -e ACCOUNT_COUNT=300 -e LOGIN_TIMEOUT=30s bookify-auth-users.js
```

## 3. Qué mide cada prueba (para explicarlo bien)

| Prueba | Qué demuestra | Qué NO demuestra |
|---|---|---|
| `bookify-5000-users.js` | 5000 peticiones autenticadas reales a Azure con 50 usuarios concurrentes | 5000 logins: inicia sesión 50 veces en `setup()` y cada usuario virtual reutiliza su token |
| `bookify-auth-users.js` | Cada cuenta del CSV inicia sesión, lee su propio perfil y cierra sesión | Concurrencia alta: el login usa bcrypt y Azure (0.5 vCPU) procesa ~2 cuentas/s |
| `bookify-pagination.js` | 108 combinaciones de página y límite en categorías, negocios y servicios | — |

## 4. Comandos del informe final impreso (sección 9.5 y Apéndice A.4)

Se ejecutan en PowerShell desde la carpeta `backend`:

```powershell
powershell -ExecutionPolicy Bypass -File .\prepare-bookify-accounts.ps1
powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 20 -VirtualUsers 1
powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 5000 -VirtualUsers 3
```

- `prepare-bookify-accounts.ps1` junta los CSV de `private/`, quita duplicados y escribe
  `bookify-5000-consolidated.csv` con exactamente 5000 cuentas
  (`Distinct input accounts: 5000`).
- `run-bookify-5000.ps1` comprueba k6, los CSV y la API, y ejecuta
  `bookify-auth-users.js` contra Azure. Guarda dashboard y resumen en `results/`.
- `-ExecutionPolicy Bypass` solo afecta a ese comando; sin él, Windows bloquea los `.ps1`.
- Duración aproximada contra Azure: 20 cuentas ≈ 30 s; 5000 cuentas con 3 usuarios
  virtuales ≈ 25–30 min.

## 5. Resultados contra Azure (15/11/2026, con el código de `3db65b1`)

| Prueba | Resultado | p95 | Duración |
|---|---|---|---|
| Paginado | 324/324 checks, 0 errores | 745 ms | 11 s |
| Carga 1000 (50 VUs) | 2050/2050 checks, 0 errores | 421 ms (API) | 39 s |
| Carga 5000 (50 VUs) | 10050/10050 checks, 0 errores | 339 ms (API) | 64 s |
| Cuentas distintas, 20 (1 VU) | 80/80 checks, 0 errores | 882 ms | 31 s |
| Cuentas distintas, 300 (5 VUs, timeout 5 s) | 287/300 logins; 13 cortados a los 5 s | 2.55 s | 3 min |

La última fila es la razón del parámetro `LOGIN_TIMEOUT`: con el timeout original de
5 s, algunos logins se cortaban mientras Azure estaba ocupado. No eran errores del
servidor. Repetido con 60 cuentas, pasó al 100 %.

## 6. Problemas frecuentes

| Síntoma | Solución |
|---|---|
| `k6` no se reconoce | Abrir una terminal nueva o usar `"C:\Program Files\k6\k6.exe"` |
| `open ./private/...csv: no such file` | Copiar los dos CSV a `private/` y ejecutar desde `backend/tests/load` |
| `Authentication failed: HTTP 429` | Demasiados logins a la vez: esperar 3 min y bajar `VUS` |
| Logins con `HTTP 0` contra Azure | Añadir `-e LOGIN_TIMEOUT=30s` |
| `API failure ... HTTP 429` | Límite global de 20 000 peticiones en 15 min: esperar |
| "La ejecución de scripts está deshabilitada" | Usar `powershell -ExecutionPolicy Bypass -File ...` |

## 7. Modo rápido para 5000 cuentas reales (~2–4 min en vez de ~45 min)

La lentitud venía de `bcrypt.compare` con costo 12 en cada login (~0.5 s de CPU en
Azure por cuenta). Cada cuenta sigue haciendo login real, perfil y logout:

1. Bajar el costo del hash **solo** de las cuentas `loadtest-*@example.test`
   (misma contraseña, no toca usuarios reales):
   `node scripts/fast-hash-load-users.cjs`
2. En Azure, definir la variable de entorno `LOAD_TEST_KEY` (32+ caracteres aleatorios)
   y desplegar. Las peticiones con la cabecera `X-Load-Test-Key` igual a esa clave
   se saltan el limitador de login y el limitador general. Sin la variable no hay bypass.
3. Ejecutar con muchos usuarios virtuales:
   `powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 5000 -VirtualUsers 50 -LoadTestKey <clave>`
4. Al terminar: quitar `LOAD_TEST_KEY` de Azure y, si se quiere, restaurar el costo:
   `node scripts/fast-hash-load-users.cjs --rounds 12`

## 8. Registro de 5000 cuentas nuevas (`bookify-register-users.js`)

Cada iteración registra una cuenta nueva por la API (`POST /api/auth/register`),
inicia sesión con ella y comprueba que `/api/auth/me` devuelve esa misma cuenta.
Los emails son `loadtest-reg<run>-NNNNN@example.test`.

Con la clave de prueba de carga, el backend se salta el límite de 5 registros por hora
y cifra estas cuentas sintéticas con bcrypt de costo 4 (las reales siguen con 12):

```
k6 run --linger -e "BASE_URL=$api" -e ACCOUNT_COUNT=5000 -e VUS=50 -e "LOAD_TEST_KEY=$key" --summary-export results\vivo-registro-5000.json bookify-register-users.js
```

Para borrar todas las cuentas de prueba (seeder, registro y la prueba antigua
`k6.bookify.*@example.com`) sin tocar administradores, dueños ni clientes reales,
usar `backend/sql/cleanup-load-test-users.sql` en el SQL Editor de Supabase
(primero el PASO 1 de vista previa, luego el PASO 2).

Prueba con límite de tiempo (cuántas cuentas quedan registradas en N segundos):
`-e MAX_DURATION=2s -e GRACEFUL_STOP=0s`. El conteo real se mira en Supabase con el
`Run id` que imprime k6, porque las peticiones que estaban en curso al cortar también
quedan guardadas.

Más cuentas en una ventana corta: `-e REGISTER_ONLY=1` (solo registra, sin login ni
perfil) y más usuarios virtuales. Medido contra Azure el 16/11/2026, ventana de 2 s:
50 VU completo = 50 cuentas; 50 VU solo registro = 151; 200 VU = 290; 500 VU = 663
(302 guardadas dentro de los primeros 2 s según `created_at`). El techo es la API
(~150 registros/s con 0,5 vCPU y 1 réplica). `-e WARMUP=1` abre las conexiones antes
de la ventana; no cambió el resultado.

### Un solo comando: `run-bookify-register.ps1`

Desde `backend` (registra, abre el dashboard en vivo y cuenta en Supabase al final):

```powershell
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key                      # 5000 cuentas
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 6000 -Seconds 2  # cuántas en 2 s
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Full -VirtualUsers 50     # + login y perfil
```

### Registro por lotes (`bookify-register-batch.js`)

`POST /api/auth/register-batch` registra hasta 2000 cuentas por petición con un solo insert.
Solo existe con la clave de prueba (sin ella responde 404) y solo acepta emails
`loadtest-*@example.test` como CLIENT. Cada cuenta se valida y recibe su propio hash.

```powershell
powershell -ExecutionPolicy Bypass -File .\run-bookify-register.ps1 -LoadTestKey $key -Accounts 6000 -Seconds 2 -BatchSize 50
```

## 9. Pruebas de 100 000 a 500 000 cuentas (20/11/2026)

Cambios para llegar a esa escala:

- Lotes de hasta **2000** cuentas por petición (`BATCH_SIZE`, por defecto 1000).
- El cuerpo de cada lote viaja comprimido con **gzip** (`COMPRESS=0` lo desactiva).
- Una contraseña por lote (`SHARED_PASSWORD=1`, por defecto): el servidor cifra con
  bcrypt **una vez por contraseña distinta**. `SHARED_PASSWORD=0` vuelve a una por cuenta.
- El INSERT ya no devuelve las filas (`count` en vez de `RETURNING id`).

Medido contra la API local conectada a la misma base de Supabase:

| Cuentas | Lotes en paralelo | Tiempo | Cuentas/s | Fallos |
|---|---|---|---|---|
| 40 000 | 10 × 2000 | 1,8 s | ~22 800 | 0 % |
| 100 000 | 20 × 2000 | 4,0 s | ~25 100 | 0 % |

Medido contra **la API en Azure** (20/11/2026, lotes de 2000 con gzip, 0 % de fallos):

| Configuración de Azure | Prueba | Resultado |
|---|---|---|
| 0,5 vCPU, máx. 1 réplica | 100 000 cuentas, 20 VU | 100 000 en ~7,3 s (13 700/s) |
| 0,5 vCPU, máx. 1 réplica | 500 000 con límite de 10 s | **186 000** guardadas en 10 s |
| 0,5 vCPU, **máx. 4 réplicas** | 500 000 completas, 30 VU | **500 000 en 20,5 s** (21 500/s); **340 000 en los primeros 10 s** |

Azure añade réplicas en ~30 s, así que para la ventana de 10 s conviene "calentar"
antes con una corrida corta (o subir temporalmente las réplicas mínimas).

El techo lo pone la escritura en PostgreSQL (~23 000–25 000 filas/s); 500 000 cuentas
toman ~20–25 s, y en una ventana de 10 s entran ~200 000–250 000.

```powershell
cd C:Devookifyackend
powershell -ExecutionPolicy Bypass -File .un-bookify-register.ps1 -LoadTestKey $key -Accounts 100000 -BatchSize 2000 -VirtualUsers 20
powershell -ExecutionPolicy Bypass -File .un-bookify-register.ps1 -LoadTestKey $key -Accounts 500000 -BatchSize 2000 -VirtualUsers 20 -Seconds 10
```

Al terminar, borrar las cuentas de prueba con `backend/sql/cleanup-load-test-users.sql`
(PASO 1 vista previa, PASO 2 borrado).
