<#
  BOOKIFY - Prepara el archivo de 5000 cuentas de prueba (informe, seccion 9.5, paso 3)

  Junta todos los CSV de backend\tests\load\private, elimina duplicados por id y email
  y escribe exactamente 5000 cuentas en bookify-5000-consolidated.csv.
  Se niega a continuar si hay menos de 5000 cuentas distintas.

  Uso (desde la carpeta backend):
    powershell -ExecutionPolicy Bypass -File .\prepare-bookify-accounts.ps1
#>
param(
  [ValidateRange(1, 5000)]
  [int]$Required = 5000
)

$ErrorActionPreference = "Stop"

$privateDir = Join-Path $PSScriptRoot "tests\load\private"
$output = Join-Path $privateDir "bookify-5000-consolidated.csv"

if (-not (Test-Path $privateDir)) {
  Write-Host ""
  Write-Host "No existe la carpeta $privateDir" -ForegroundColor Red
  Write-Host "Creala y copia dentro el CSV de cuentas de prueba (no esta en GitHub porque contiene contrasenas)." -ForegroundColor Yellow
  exit 1
}

# The consolidated file goes first so an existing, already validated set is kept in order
$files = @(Get-ChildItem $privateDir -Filter "*.csv" | Sort-Object { $_.FullName -ne $output }, Name)

if ($files.Count -eq 0) {
  Write-Host ""
  Write-Host "No hay archivos CSV en $privateDir" -ForegroundColor Red
  Write-Host "Copia ahi el archivo bookify-5000-consolidated.csv que te paso el equipo." -ForegroundColor Yellow
  exit 1
}

$seenIds = @{}
$seenEmails = @{}
$accounts = New-Object System.Collections.Generic.List[object]

foreach ($file in $files) {
  $rows = @(Import-Csv $file.FullName)

  if ($rows.Count -gt 0) {
    $columns = $rows[0].PSObject.Properties.Name
    if (-not (($columns -contains "id") -and ($columns -contains "email") -and ($columns -contains "password"))) {
      Write-Host "Se ignora $($file.Name): no tiene las columnas id,email,password" -ForegroundColor Yellow
      continue
    }
  }

  foreach ($row in $rows) {
    $id = "$($row.id)".Trim()
    $email = "$($row.email)".Trim().ToLower()
    if (-not $id -or -not $email -or -not $row.password) { continue }
    if ($seenIds.ContainsKey($id) -or $seenEmails.ContainsKey($email)) { continue }
    $seenIds[$id] = $true
    $seenEmails[$email] = $true
    $accounts.Add([pscustomobject]@{ id = $id; email = $email; password = $row.password })
  }

  Write-Host ("Leido {0}: {1} filas" -f $file.Name, $rows.Count)
}

if ($accounts.Count -lt $Required) {
  Write-Host ""
  Write-Host ("Solo hay {0} cuentas distintas; se necesitan {1}. No se escribio nada." -f $accounts.Count, $Required) -ForegroundColor Red
  exit 1
}

$selected = $accounts | Select-Object -First $Required

# UTF-8 without BOM so k6 reads the header correctly
$lines = @("id,email,password") + ($selected | ForEach-Object { "{0},{1},{2}" -f $_.id, $_.email, $_.password })
[System.IO.File]::WriteAllLines($output, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))

Write-Host ""
Write-Host "Archivo listo: $output" -ForegroundColor Green
Write-Host ("Distinct input accounts: {0}" -f $Required) -ForegroundColor Green
