# Режим разработки: API на 3001, Vite на 5173. Docker больше не нужен.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "Автономный запуск для повседневной работы: start.bat" -ForegroundColor Green
Write-Host ""
Write-Host "Терминал 1 (API):" -ForegroundColor Yellow
Write-Host "  cd $PSScriptRoot\backend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Терминал 2 (сайт):" -ForegroundColor Yellow
Write-Host "  cd $PSScriptRoot\frontend"
Write-Host "  npm run dev"
Write-Host ""
Write-Host "Сайт: http://127.0.0.1:5173   вход: admin (пароль — data\credentials.txt, если ещё не меняли)" -ForegroundColor Green
