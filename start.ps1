$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "scripts\launch.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
