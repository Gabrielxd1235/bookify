<#
  BOOKIFY - Verificacion de cuentas distintas contra Azure (informe, seccion 9.5)

  Ejecuta tests\load\bookify-auth-users.js: por cada cuenta distinta del CSV hace
  login, lee su propio perfil (/api/auth/me) y cierra la sesion. Genera el dashboard
  HTML de k6 y el resumen JSON en backend\tests\load\results.

  Uso (desde la carpeta backend):
    powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 20 -VirtualUsers 1
    powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 5000 -VirtualUsers 3
    Rapido (tras node scripts\fast-hash-load-users.cjs y LOAD_TEST_KEY en el servidor):
    powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 5000 -VirtualUsers 50 -LoadTestKey <clave>
#>
param(
  [ValidateRange(1, 6000)]
  [int]$TotalUsers = 20,

  [ValidateRange(1, 200)]
  [int]$VirtualUsers = 1,

  # Same value as LOAD_TEST_KEY on the server: skips the rate limiters
  [string]$LoadTestKey = $env:LOAD_TEST_KEY,

  [string]$BaseUrl = "https://bookify-api.orangesky-480d5b34.mexicocentral.azurecontainerapps.io"
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

$loadDir = Join-Path $PSScriptRoot "tests\load"
$privateDir = Join-Path $loadDir "private"
$resultsDir = Join-Path $loadDir "results"
$script = "bookify-auth-users.js"

function Stop-WithMessage([string]$message, [string]$hint) {
  Write-Host ""
  Write-Host $message -ForegroundColor Red
  if ($hint) { Write-Host $hint -ForegroundColor Yellow }
  exit 1
}

Write-Host ""
Write-Host "BOOKIFY - verificacion de cuentas distintas" -ForegroundColor Cyan
Write-Host "-------------------------------------------"

# 1. k6 installed
if (-not (Get-Command k6 -ErrorAction SilentlyContinue)) {
  Stop-WithMessage "k6 no esta instalado o no esta en el PATH." "Instala con: winget install k6 --source winget  (luego cierra y vuelve a abrir PowerShell)"
}
Write-Host ("[ok] k6:    " + ((& k6 version) -join " "))

# 2. Test script present
if (-not (Test-Path (Join-Path $loadDir $script))) {
  Stop-WithMessage "No se encontro tests\load\$script" "Actualiza el repositorio con: git pull"
}

# 3. Account file: the latest seeder run (bookify-users-latest.csv). Older CSVs
#    may list accounts already removed by sql\cleanup-load-test-users.sql.
$latest = Join-Path $privateDir "bookify-users-latest.csv"
$files = @($latest) | Where-Object { Test-Path $_ }
if (-not $files -or $files.Count -eq 0) {
  Stop-WithMessage "No hay cuentas de prueba en $latest" "Crealas desde backend con: node scripts\seed-load-users.cjs 5000 --rounds 4"
}
$accountCount = ($files | ForEach-Object { @(Import-Csv $_).Count } | Measure-Object -Sum).Sum
if ($accountCount -lt $TotalUsers) {
  Stop-WithMessage "Hay $accountCount cuentas y pediste $TotalUsers." "Usa -TotalUsers $accountCount o menos."
}
Write-Host ("[ok] CSV:   {0} cuentas en {1} archivo(s)" -f $accountCount, $files.Count)

# 4. API reachable
try {
  $health = Invoke-RestMethod "$BaseUrl/api/health" -TimeoutSec 60
} catch {
  Stop-WithMessage "No se pudo contactar la API en $BaseUrl/api/health" "Revisa tu conexion a internet. Si la API estaba inactiva, espera un minuto y repite."
}
Write-Host "[ok] API:   $BaseUrl ($($health.status))"

# 5. Output files
New-Item -ItemType Directory -Force $resultsDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$name = "cuentas-$TotalUsers-$stamp"
$dashboard = Join-Path $resultsDir "$name-dashboard.html"
$summary = Join-Path $resultsDir "$name-summary.json"

# Generous upper bound; with fast hashes 5000 accounts take a few minutes
$maxMinutes = [math]::Max(10, [math]::Ceiling($TotalUsers / ($VirtualUsers * 1.5) / 60 * 1.5))
if ($VirtualUsers -ge 10 -and -not $LoadTestKey) {
  Write-Host "Aviso: sin -LoadTestKey el limitador de login puede bloquear con 10+ usuarios." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Cuentas: $TotalUsers   Usuarios simultaneos: $VirtualUsers   Tiempo maximo: $maxMinutes min"
Write-Host "No inicies sesion en BOOKIFY desde esta red mientras corre la prueba."
Write-Host "Dashboard en vivo: http://127.0.0.1:5665"
Write-Host ""

$relativeFiles = ($files | ForEach-Object { "./private/" + (Split-Path $_ -Leaf) }) -join ","
# Live dashboard at http://127.0.0.1:5665 (opens the browser) plus HTML export at the end.
# Save the caller's values and restore them in `finally`, so a Ctrl+C never leaves
# these variables changed in the session.
$dashVars = "K6_WEB_DASHBOARD", "K6_WEB_DASHBOARD_PORT", "K6_WEB_DASHBOARD_OPEN", "K6_WEB_DASHBOARD_EXPORT"
$savedDash = @{}
foreach ($v in $dashVars) { $savedDash[$v] = [Environment]::GetEnvironmentVariable($v, "Process") }
$env:K6_WEB_DASHBOARD = "true"
$env:K6_WEB_DASHBOARD_PORT = "5665"
$env:K6_WEB_DASHBOARD_OPEN = "true"
$env:K6_WEB_DASHBOARD_EXPORT = $dashboard
$startedAt = Get-Date
$exitCode = 1

# k6 must run from tests\load because the script reads ./private/...
Push-Location $loadDir
try {
  $ErrorActionPreference = "Continue"
  & k6 run `
    -e "BASE_URL=$BaseUrl" `
    -e "USERS_FILES=$relativeFiles" `
    -e "ACCOUNT_COUNT=$TotalUsers" `
    -e "VUS=$VirtualUsers" `
    -e "MAX_DURATION=$($maxMinutes)m" `
    -e "LOGIN_TIMEOUT=30s" `
    -e "LOAD_TEST_KEY=$LoadTestKey" `
    --summary-export $summary `
    $script
  $exitCode = $LASTEXITCODE
} finally {
  $ErrorActionPreference = "Stop"
  Pop-Location
  foreach ($v in $dashVars) { [Environment]::SetEnvironmentVariable($v, $savedDash[$v], "Process") }
}

# 6. Short report for the evidence record
Write-Host ""
Write-Host "Resultado" -ForegroundColor Cyan
Write-Host "---------"
if (Test-Path $summary) {
  $m = (Get-Content $summary -Raw | ConvertFrom-Json).metrics
  $checks = $m.checks
  Write-Host ("Inicio:              {0}" -f $startedAt.ToString("yyyy-MM-dd HH:mm:ss"))
  Write-Host ("Duracion:            {0} min" -f [math]::Round(((Get-Date) - $startedAt).TotalMinutes, 1))
  Write-Host ("Cuentas verificadas: {0}" -f [int]$m.iterations.count)
  Write-Host ("Verificaciones:      {0} de {1}" -f [int]$checks.passes, ([int]$checks.passes + [int]$checks.fails))
  Write-Host ("Peticiones fallidas: {0:P2}" -f [double]$m.http_req_failed.value)
  Write-Host ("p95:                 {0} ms" -f [math]::Round($m.http_req_duration.'p(95)'))
}
Write-Host ""
if ($exitCode -eq 0) {
  Write-Host "PRUEBA APROBADA: todos los umbrales se cumplieron." -ForegroundColor Green
} else {
  Write-Host "PRUEBA NO APROBADA (codigo $exitCode): revisa los umbrales marcados con una X arriba." -ForegroundColor Red
}
Write-Host "Dashboard HTML: $dashboard"
Write-Host "Resumen JSON:   $summary"
exit $exitCode
