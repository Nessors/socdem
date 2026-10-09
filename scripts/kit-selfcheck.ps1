# Kit self-check. Run only from folder socdem-kit-test.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if ((Split-Path $root -Leaf) -ne "socdem-kit-test") {
  Write-Host "Run this only inside socdem-kit-test, not the live folder."
  exit 1
}

$nodeExe = Join-Path $root "runtime\node\node.exe"
$backend = Join-Path $root "backend"
$HealthUrl = "http://127.0.0.1:3001/api/health"

function Wait-Health([int]$seconds) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) {
    try {
      $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
      $data = $res.Content | ConvertFrom-Json
      if ($data.ok -eq $true -and $data.app -eq "socdem-fsit") { return $true }
    } catch {}
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Start-Kit {
  $env:SOCDEM_OPEN_BROWSER = "0"
  $env:PATH = (Join-Path $root "runtime\node") + ";" + $env:PATH
  $p = Start-Process -FilePath $nodeExe -ArgumentList "src\index.js" -WorkingDirectory $backend -PassThru -WindowStyle Hidden
  $until = (Get-Date).AddSeconds(180)
  $retried = $false
  while ((Get-Date) -lt $until) {
    if (Wait-Health 2) { return }
    if ($p.HasExited) {
      if ($p.ExitCode -eq 76 -and -not $retried) {
        $retried = $true
        & $nodeExe (Join-Path $backend "src\db.js") --restore-cluster
        if ($LASTEXITCODE -ne 0) { throw "restore-cluster failed" }
        $p = Start-Process -FilePath $nodeExe -ArgumentList "src\index.js" -WorkingDirectory $backend -PassThru -WindowStyle Hidden
        continue
      }
      throw ("Database process exited " + $p.ExitCode)
    }
  }
  throw "Database did not open in 180 seconds"
}

function Stop-Kit {
  $tokenPath = Join-Path $root "data\control.token"
  if (Test-Path $tokenPath) {
    $token = (Get-Content -Raw $tokenPath).Trim()
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/shutdown" -Method POST -Headers @{ "X-Socdem-Stop" = $token } -UseBasicParsing | Out-Null
    } catch {}
  }
  $lock = Join-Path $root "data\server.lock"
  $until = (Get-Date).AddSeconds(180)
  while ((Get-Date) -lt $until) {
    if (-not (Test-Path $lock)) { return }
    Start-Sleep -Milliseconds 400
  }
  throw "Timed out waiting for backup and lock release"
}

if (-not $env:KIT_NEW_PASSWORD) {
  $chars = (48..57) + (65..90) + (97..122)
  $env:KIT_NEW_PASSWORD = -join ($chars | Get-Random -Count 16 | ForEach-Object { [char]$_ })
}

Write-Host "1) start and live checks"
Start-Kit
try {
  & $nodeExe (Join-Path $root "scripts\kit-selfcheck.mjs") live
  if ($LASTEXITCODE -ne 0) { throw "phase live failed" }
  Start-Sleep -Seconds 2
} finally {
  Stop-Kit
}

$backupStatus = Join-Path $root "data\backup-status.json"
if (-not (Test-Path $backupStatus)) { throw "missing backup-status.json after shutdown" }
$status = Get-Content -Raw $backupStatus | ConvertFrom-Json
if ($status.verified -ne $true) { throw "backup not marked verified" }
Write-Host ("ok: backup students=" + $status.students + " photos=" + $status.photos)

Write-Host "2) restart persist check"
Start-Kit
try {
  & $nodeExe (Join-Path $root "scripts\kit-selfcheck.mjs") persist
  if ($LASTEXITCODE -ne 0) { throw "phase persist failed" }
} finally {
  Stop-Kit
}

Write-Host "3) restore from backup"
$pg = Join-Path $root "data\pgdata"
$ctrl = Join-Path $pg "global\pg_control"
if (-not (Test-Path $ctrl)) { throw "missing pg_control" }
[System.IO.File]::WriteAllBytes($ctrl, [byte[]](1, 2, 3, 4, 5, 6, 7, 8))
Start-Kit
try {
  & $nodeExe (Join-Path $root "scripts\kit-selfcheck.mjs") restore
  if ($LASTEXITCODE -ne 0) { throw "phase restore failed" }
  $parked = Get-ChildItem (Join-Path $root "data") -Directory | Where-Object { $_.Name -like "pgdata-parked-*" }
  if (-not $parked) { throw "broken cluster was not parked" }
  Write-Host "ok: broken cluster parked"
} finally {
  Stop-Kit
}

Write-Host "Kit self-check passed."