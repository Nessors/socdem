$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$tokenPath = Join-Path $root "data\control.token"

if (-not (Test-Path $tokenPath)) {
  Write-Host "База не запущена. Закрывать нечего."
  exit 0
}

$token = (Get-Content -Raw $tokenPath).Trim()
try {
  Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/shutdown" -Method POST -Headers @{ "X-Socdem-Stop" = $token } -UseBasicParsing | Out-Null
  Write-Host "Данные сохранены, база выключена."
  Write-Host "Чёрное окно можно закрыть, если оно ещё открыто."
} catch {
  Write-Host "База уже выключена или окно закрыто."
  exit 0
}