<#
  BOOKIFY - Verificacion de cuentas distintas contra Azure (informe, seccion 9.5)

  Ejecuta tests\load\bookify-auth-users.js: por cada cuenta distinta del CSV hace
  login, lee su propio perfil (/api/auth/me) y cierra la sesion. Genera el dashboard
  HTML de k6 y el resumen JSON en backend\tests\load\results.

  Uso (desde la carpeta backend):
    powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 20 -VirtualUsers 1
    powershell -ExecutionPolicy Bypass -File .\run-bookify-5000.ps1 -TotalUsers 5000 -VirtualUsers 3
#>
param(
  [ValidateRange(1, 6000)]
  [int]$TotalUsers = 20,

  [ValidateRange(1, 9)]
  [int]$VirtualUsers = 1,

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

# 3. Account files: the consolidated file if it was prepared, otherwise the two seeder files
$consolidated = Join-Path $privateDir "bookify-5000-consolidated.csv"
if (Test-Path $consolidated) {
  $files = @($consolidated)
} else {
  $files = @(
    (Join-Path $privateDir "bookify-users-mwinc5qd566ff647.csv"),
    (Join-Path $privateDir "bookify-users-mwinewgu4f2daf9a.csv")
  ) | Where-Object { Test-Path $_ }
}
if (-not $files -or $files.Count -eq 0) {
  Stop-WithMessage "No hay archivos de cuentas en $privateDir" "Copia ahi bookify-users-mwinc5qd566ff647.csv y bookify-users-mwinewgu4f2daf9a.csv (no estan en GitHub porque contienen contrasenas)."
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

# About 2 accounts per second per virtual user against Azure, plus margin
$maxMinutes = [math]::Max(5, [math]::Ceiling($TotalUsers / ($VirtualUsers * 1.5) / 60 * 1.5))
Write-Host ""
Write-Host "Cuentas: $TotalUsers   Usuarios simultaneos: $VirtualUsers   Tiempo maximo: $maxMinutes min"
Write-Host "No inicies sesion en BOOKIFY desde esta red mientras corre la prueba."
Write-Host ""

$relativeFiles = ($files | ForEach-Object { "./private/" + (Split-Path $_ -Leaf) }) -join ","
$env:K6_WEB_DASHBOARD = "true"
$env:K6_WEB_DASHBOARD_PORT = "-1"
$env:K6_WEB_DASHBOARD_EXPORT = $dashboard
$startedAt = Get-Date

# k6 must run from tests\load because the script reads ./private/...
Push-Location $loadDir
$ErrorActionPreference = "Continue"
& k6 run `
  -e "BASE_URL=$BaseUrl" `
  -e "USERS_FILES=$relativeFiles" `
  -e "ACCOUNT_COUNT=$TotalUsers" `
  -e "VUS=$VirtualUsers" `
  -e "MAX_DURATION=$($maxMinutes)m" `
  -e "LOGIN_TIMEOUT=30s" `
  --summary-export $summary `
  $script
$exitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"
Pop-Location

Remove-Item Env:\K6_WEB_DASHBOARD, Env:\K6_WEB_DASHBOARD_PORT, Env:\K6_WEB_DASHBOARD_EXPORT -ErrorAction SilentlyContinue

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
