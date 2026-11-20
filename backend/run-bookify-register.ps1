<#
  BOOKIFY - Registro de cuentas nuevas con k6 contra Azure (un solo comando)

  Registra cuentas, abre el dashboard de k6 en vivo y al final cuenta en
  Supabase cuantas quedaron guardadas. Las cuentas son
  loadtest-reg<run>-NNNNN@example.test y se borran con
  sqlcleanup-load-test-users.sql (conserva las 5000 cuentas de login).

  Parametros (cualquier combinacion):
    -Accounts      cuantas cuentas registrar (1 a 500000)
    -Seconds       limite de tiempo en segundos (0 = sin limite)
    -BatchSize     cuentas por peticion (1 a 2000). 0 = una por peticion
    -VirtualUsers  peticiones simultaneas (por lotes: 20 por defecto)
    -Full          registro + login + perfil (solo sin -BatchSize)

  Ejemplos (desde la carpeta backend):
    # 100 000 cuentas, sin limite de tiempo
    powershell -ExecutionPolicy Bypass -File .un-bookify-register.ps1 -LoadTestKey $key -Accounts 100000 -BatchSize 2000

    # Medio millon con limite de 10 segundos (cuantas entran)
    powershell -ExecutionPolicy Bypass -File .un-bookify-register.ps1 -LoadTestKey $key -Accounts 500000 -BatchSize 2000 -Seconds 10

    # Cualquier cantidad y tiempo, p. ej. 250 000 en 5 segundos
    powershell -ExecutionPolicy Bypass -File .un-bookify-register.ps1 -LoadTestKey $key -Accounts 250000 -BatchSize 2000 -Seconds 5

    # Una cuenta por peticion + login + perfil (prueba que cada cuenta funciona)
    powershell -ExecutionPolicy Bypass -File .un-bookify-register.ps1 -LoadTestKey $key -Accounts 5000 -Full -VirtualUsers 50
#>
param(
  [ValidateRange(1, 500000)]
  [int]$Accounts = 5000,

  [ValidateRange(1, 1000)]
  [int]$VirtualUsers = 500,

  # 0 = sin limite (registra todas). Por ejemplo 2 = corta a los 2 segundos.
  [ValidateRange(0, 3600)]
  [int]$Seconds = 0,

  # Ademas del registro, hace login y lee el perfil de cada cuenta
  [switch]$Full,

  # 0 = una cuenta por peticion. 1-2000 = registro por lotes (/api/auth/register-batch)
  [ValidateRange(0, 2000)]
  [int]$BatchSize = 0,

  [string]$LoadTestKey = $env:LOAD_TEST_KEY,

  [string]$BaseUrl = "https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$loadDir = Join-Path $PSScriptRoot "tests\load"
$resultsDir = Join-Path $loadDir "results"
$script = if ($BatchSize -gt 0) { "bookify-register-batch.js" } else { "bookify-register-users.js" }
# Batches of up to 2000 gzip-compressed accounts: 20 simultaneous requests
# reached ~14 000 accounts/s with 1 replica and ~21 500/s with 4 (20/11/2026)
if ($BatchSize -gt 0 -and -not $PSBoundParameters.ContainsKey("VirtualUsers")) { $VirtualUsers = 20 }
if ($BatchSize -gt 0 -and $Full) { Write-Host "Aviso: -Full no aplica al registro por lotes; se ignora." -ForegroundColor Yellow; $Full = $false }

function Stop-WithMessage([string]$message, [string]$hint) {
  Write-Host ""
  Write-Host $message -ForegroundColor Red
  if ($hint) { Write-Host $hint -ForegroundColor Yellow }
  exit 1
}

Write-Host ""
Write-Host "BOOKIFY - registro de cuentas con k6" -ForegroundColor Cyan
Write-Host "------------------------------------"

if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "k6 no esta instalado o no esta en el PATH." "Instala con: winget install k6 --source winget"
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "Node.js no esta instalado (se usa para contar en Supabase)." ""
}
if (-not (Test-Path (Join-Path $PSScriptRoot ".env"))) {
  Stop-WithMessage "Falta backend\.env (credenciales de Supabase para contar las cuentas)." ""
}

# The key decides whether the API rate limit lets the test through
if (-not $LoadTestKey) {
  if ($BatchSize -gt 0) { Stop-WithMessage "El registro por lotes necesita -LoadTestKey." "" }
  Write-Host "Aviso: sin -LoadTestKey el backend solo permite 5 registros por hora." -ForegroundColor Yellow
} else {
  $headers = (& curl.exe -s -D - -o NUL -H "X-Load-Test-Key: $LoadTestKey" "$BaseUrl/api/health") -join "`n"
  if ($headers -notmatch "HTTP/\S+ 200") {
    Stop-WithMessage "No se pudo contactar la API en $BaseUrl" "Si estaba inactiva, espera un minuto y repite."
  }
  if ($headers -match "(?im)^ratelimit:") {
    Stop-WithMessage "La API no reconoce la clave (aparece la cabecera ratelimit)." "Revisa que -LoadTestKey sea la clave correcta."
  }
  Write-Host "[ok] API y clave: $BaseUrl"
}

# Run id fixed here so the run can be counted in Supabase afterwards
$chars = "abcdefghijklmnopqrstuvwxyz0123456789".ToCharArray()
$runId = "p" + (-join (1..10 | ForEach-Object { $chars | Get-Random }))

New-Item -ItemType Directory -Force $resultsDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$name = "registro-$Accounts-$stamp"
$dashboard = Join-Path $resultsDir "$name-dashboard.html"
$summary = Join-Path $resultsDir "$name-summary.json"

$mode = if ($BatchSize -gt 0) { "lotes de $BatchSize" } elseif ($Full) { "registro + login + perfil" } else { "solo registro" }
$limit = if ($Seconds -gt 0) { "$Seconds s" } else { "sin limite" }
Write-Host ""
Write-Host "Cuentas: $Accounts   Usuarios simultaneos: $VirtualUsers   Modo: $mode   Tiempo: $limit"
Write-Host "Run id: $runId   (emails loadtest-reg$runId-NNNNN@example.test)"
Write-Host "Dashboard en vivo: http://127.0.0.1:5665"
Write-Host ""

$k6Args = @(
  "run",
  "-e", "BASE_URL=$BaseUrl",
  "-e", "ACCOUNT_COUNT=$Accounts",
  "-e", "VUS=$VirtualUsers",
  "-e", "RUN_ID=$runId",
  "-e", "LOAD_TEST_KEY=$LoadTestKey"
)
if ($BatchSize -gt 0) { $k6Args += @("-e", "BATCH_SIZE=$BatchSize") }
elseif (-not $Full) { $k6Args += @("-e", "REGISTER_ONLY=1") }
if ($Seconds -gt 0) {
  $k6Args += @("-e", "MAX_DURATION=$($Seconds)s", "-e", "GRACEFUL_STOP=0s")
}
$k6Args += @("--summary-export", $summary, $script)

$dashVars = "K6_WEB_DASHBOARD", "K6_WEB_DASHBOARD_PORT", "K6_WEB_DASHBOARD_OPEN", "K6_WEB_DASHBOARD_PERIOD", "K6_WEB_DASHBOARD_EXPORT"
$savedDash = @{}
foreach ($v in $dashVars) { $savedDash[$v] = [Environment]::GetEnvironmentVariable($v, "Process") }
$env:K6_WEB_DASHBOARD = "true"
$env:K6_WEB_DASHBOARD_PORT = "5665"
$env:K6_WEB_DASHBOARD_OPEN = "true"
$env:K6_WEB_DASHBOARD_PERIOD = "1s"
# k6 v2 hangs after very short runs when asked to export the HTML report
# ("report generation was skipped"), so export only runs long enough for it.
$exportReport = ($Seconds -ge 10) -or ($Seconds -eq 0 -and $Accounts -ge 1000)
if ($exportReport) {
  $env:K6_WEB_DASHBOARD_EXPORT = $dashboard
} else {
  [Environment]::SetEnvironmentVariable("K6_WEB_DASHBOARD_EXPORT", $null, "Process")
  $dashboard = "(no se genera en corridas cortas; usar el boton Report del dashboard en vivo)"
}
$startedAt = Get-Date
$exitCode = 1

Push-Location $loadDir
try {
  $ErrorActionPreference = "Continue"
  & k6 @k6Args
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = "Stop"
  Pop-Location
  foreach ($v in $dashVars) { [Environment]::SetEnvironmentVariable($v, $savedDash[$v], "Process") }
}

Write-Host ""
Write-Host "Resultado" -ForegroundColor Cyan
Write-Host "---------"
Write-Host ("Duracion total:            {0} s" -f [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1))
if (Test-Path $summary) {
  $m = (Get-Content $summary -Raw | ConvertFrom-Json).metrics
  Write-Host ("Confirmadas por k6:        {0}" -f [int]$m.bookify_registered_accounts.count)
  Write-Host ("Peticiones fallidas:       {0:P2}" -f [double]$m.http_req_failed.value)
}

# Supabase is the source of truth: requests in flight at the cut are saved too
Push-Location $PSScriptRoot
try {
  & node scripts\count-registered.cjs $runId $Seconds
} finally {
  Pop-Location
}

Write-Host ""
if ($Seconds -gt 0) {
  Write-Host "Con limite de tiempo es normal que k6 marque los umbrales con X: se corto a proposito." -ForegroundColor Yellow
} elseif ($exitCode -eq 0) {
  Write-Host "PRUEBA APROBADA: todas las cuentas se registraron." -ForegroundColor Green
} else {
  Write-Host "PRUEBA NO APROBADA (codigo $exitCode): revisa los umbrales marcados con X." -ForegroundColor Red
}
Write-Host "Dashboard HTML: $dashboard"
Write-Host "Resumen JSON:   $summary"
exit $exitCode
