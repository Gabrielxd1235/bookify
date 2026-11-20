# BOOKIFY – Estrategia de migración de servidor sin pérdida de servicio

Objetivo: cambiar el servidor de la API (nueva versión, nueva región, otro proveedor o
otra base de datos) sin que los usuarios pierdan reservas, sesiones ni pagos, y con
una caída de servicio de **0 a pocos segundos**.

## 1. Punto de partida

| Pieza | Dónde está hoy | Por qué facilita la migración |
|---|---|---|
| Frontend (React + Vite) | Azure Static Web Apps | Archivos estáticos; la URL de la API es una variable de build (`VITE_API_URL`). |
| API (Node.js + Express) | Azure Container Apps, imagen en `ghcr.io/gabrielxd1235/bookify-api` | La imagen Docker corre igual en cualquier proveedor (Azure, AWS, GCP, un VPS). |
| Base de datos | Supabase (PostgreSQL) | PostgreSQL estándar: se puede replicar o exportar con herramientas nativas. |
| Sesiones | JWT de acceso (stateless) + refresh token guardado en la base | Ninguna sesión vive en la memoria del servidor: cambiar de servidor no cierra sesiones. |
| Pagos y reservas | Funciones SQL transaccionales (`bookify_pay_mock`, `create_pending_reservation`) | La lógica crítica está en la base: dos servidores a la vez no generan dobles cobros. |

Lo que ya está en el código y hace posible migrar en caliente:

- **`/api/health/live`** (el proceso vive) y **`/api/health/ready`** (la API y la base responden; 503 con el motivo si no).
- **Apagado ordenado**: al recibir `SIGTERM` la API deja de aceptar peticiones nuevas (responde 503 `SERVER_RESTARTING` con `Retry-After`), termina las que estaban en curso y se apaga (máx. 10 s).
- **Logs estructurados** con `requestId`, para comparar el comportamiento de la versión vieja y la nueva.
- **Migraciones de base aditivas** (expand/contract): la 005 solo agrega columnas, tablas y funciones; la versión anterior de la API sigue funcionando con la base nueva.

## 2. Estrategia A – Nueva versión en el mismo Azure (blue-green con revisiones)

Container Apps guarda cada despliegue como una **revisión**. En modo *multiple revisions*:

1. Desplegar la versión nueva como revisión **green** con 0 % del tráfico.
2. Probarla por su URL propia: `/api/health/ready`, prueba de paginado de k6 y un pago de prueba.
3. **Canary**: mover 10 % del tráfico a green y vigilar el panel "BOOKIFY pruebas de carga" (5xx, CPU, reinicios) y los logs (`level = error`).
4. Si todo está bien, 100 % a green. La revisión vieja (**blue**) queda activa sin tráfico unas horas.
5. **Rollback** = devolver el 100 % a blue (segundos, sin redeploy).

Comandos (Azure CLI):

```bash
az containerapp revision set-mode -n bookify-api -g bookify-rg --mode multiple
az containerapp update -n bookify-api -g bookify-rg --image ghcr.io/gabrielxd1235/bookify-api:<sha> --revision-suffix green
az containerapp ingress traffic set -n bookify-api -g bookify-rg --revision-weight bookify-api--blue=90 bookify-api--green=10
az containerapp ingress traffic set -n bookify-api -g bookify-rg --revision-weight bookify-api--green=100
# rollback inmediato
az containerapp ingress traffic set -n bookify-api -g bookify-rg --revision-weight bookify-api--blue=100
```

Hoy el pipeline (GitHub Actions) despliega en modo de revisión única: Azure arranca la
revisión nueva, espera a que esté lista y recién entonces le pasa el tráfico; la vieja
termina sus peticiones gracias al apagado ordenado. Después el pipeline comprueba
`/api/health/ready` y marca el despliegue como fallido si la API no queda lista.

## 3. Estrategia B – Mudar la API a otro servidor, región o proveedor

1. **Preparar el destino** con la misma imagen Docker y las mismas variables
   (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`, `FRONTEND_URL`, `PAYMENT_MODE`…).
   El `JWT_SECRET` debe ser **el mismo**, así los tokens emitidos por el servidor viejo siguen siendo válidos.
2. **Validar en paralelo**: el servidor nuevo usa la misma base; se prueba con k6
   (`bookify-pagination.js`, registro por lotes pequeño) contra su URL.
3. **Agregar el dominio nuevo a CORS** (`FRONTEND_URL`) en ambos servidores.
4. **Cambiar el tráfico**:
   - con un dominio propio para la API (p. ej. `api.bookify.pe`): bajar el TTL del DNS a 60 s un día antes y apuntarlo al nuevo servidor; o
   - con Azure Front Door / un balanceador: agregar el nuevo origen y repartir 10 % → 50 % → 100 %; o
   - sin dominio propio: recompilar el frontend con el nuevo `VITE_API_URL` (Static Web Apps publica en ~1 min; el servidor viejo sigue atendiendo a quien tenga la versión anterior abierta).
5. **Drenar el servidor viejo**: se deja encendido 24–48 h. Sus peticiones en curso
   terminan (apagado ordenado) y los clientes reintentan solos ante un 503 con `Retry-After`.
6. **Apagar el viejo** cuando sus logs ya no muestren tráfico.

Pérdida de servicio esperada: **ninguna** (los dos servidores atienden a la vez y
comparten la base). El trabajo programado de expiración de reservas puede correr en los
dos sin problema: usa `pg_advisory_xact_lock` por negocio y es idempotente.

## 4. Estrategia C – Migrar la base de datos

La base es la pieza delicada: ahí están usuarios, reservas y pagos.

1. **Respaldo** completo antes de empezar (Supabase → Database → Backups, o `pg_dump`).
2. **Replicación lógica** de Supabase a la base nueva (`CREATE PUBLICATION` en el origen,
   `CREATE SUBSCRIPTION` en el destino). Copia todo y sigue copiando cada cambio en vivo.
3. Comprobar que los conteos coinciden (`users`, `reservations`, `bookify_mock_deposit_payments`, `business_reviews`).
4. **Ventana corta de solo lectura** (30–60 s): poner la API en mantenimiento para
   escrituras, esperar a que la réplica alcance al origen, ajustar las secuencias
   (`setval`) y cambiar `SUPABASE_URL`/credenciales de la API (nueva revisión).
5. Volver a habilitar escrituras. El origen queda como respaldo de solo lectura.

Pérdida de servicio esperada: **segundos de escrituras en pausa**; las lecturas no se interrumpen.

Reglas para las migraciones de esquema (ya aplicadas en la 005):
- primero **agregar** (columnas nullables, tablas, funciones nuevas con otro nombre);
- desplegar el código que usa lo nuevo;
- **retirar** lo viejo solo en una migración posterior, cuando ninguna versión lo use.

## 5. Checklist de migración

- [ ] Respaldo de la base verificado.
- [ ] Imagen nueva construida por el pipeline (tests en verde).
- [ ] Servidor nuevo responde `GET /api/health/ready` → 200.
- [ ] Prueba k6 de paginado y un pago de prueba contra el servidor nuevo.
- [ ] `FRONTEND_URL` (CORS) y `JWT_SECRET` iguales en ambos servidores.
- [ ] Tráfico movido de forma gradual (10 % → 100 %) mirando el panel de Azure y los logs.
- [ ] Servidor viejo encendido 24–48 h para rollback.
- [ ] Clave de pruebas de carga desactivada si no se va a usar (`LOAD_TEST_KEY_SHA256=off`).

## 6. Plan de rollback

| Situación | Acción | Tiempo |
|---|---|---|
| La revisión nueva da errores 5xx | Tráfico 100 % a la revisión anterior | segundos |
| El servidor nuevo (otro proveedor) falla | Volver el DNS/Front Door o el `VITE_API_URL` al servidor viejo | 1–5 min |
| La migración de base falla antes del corte | Cancelar la suscripción; la base original nunca dejó de ser la principal | inmediato |
| Falla después del corte | Volver la API a la base original (sigue recibiendo la replicación inversa o se restaura el respaldo) | minutos |
