# Служебный скрипт для разработки. Штатный запуск его не вызывает.
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$dest = Join-Path $root "runtime\node"
$exe = Join-Path $dest "node.exe"

if (Test-Path $exe) {
  exit 0
}

New-Item -ItemType Directory -Force -Path $dest | Out-Null

$installed = "C:\Program Files\nodejs\node.exe"
if (Test-Path $installed) {
  Write-Host "Копирую встроенный движок из установленного Node.js..."
  robocopy "C:\Program Files\nodejs" $dest /E /NFL /NDL /NJH /NJS /NC /NS | Out-Null
  if (Test-Path $exe) { exit 0 }
}

$ver = "v22.23.3"
$zipName = "node-$ver-win-x64.zip"
$url = "https://nodejs.org/dist/$ver/$zipName"
$zip = Join-Path $env:TEMP $zipName
Write-Host "Скачиваю встроенный движок ($ver) — это один раз..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
$unpack = Join-Path $env:TEMP "socdem-node-unpack"
if (Test-Path $unpack) { Remove-Item $unpack -Recurse -Force }
Expand-Archive -Path $zip -DestinationPath $unpack -Force
$inner = Get-ChildItem $unpack -Directory | Select-Object -First 1
Copy-Item -Path (Join-Path $inner.FullName "*") -Destination $dest -Recurse -Force
Remove-Item $zip -Force -ErrorAction SilentlyContinue
Remove-Item $unpack -Recurse -Force -ErrorAction SilentlyContinue

if (-not (Test-Path $exe)) {
  Write-Host "Не удалось подготовить движок. Проверьте интернет и попробуйте ещё раз."
  exit 1
}
