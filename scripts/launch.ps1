$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$HealthUrl = "http://127.0.0.1:3001/api/health"

function Fail([string]$message, [switch]$CopyHint) {
  Write-Host ""
  Write-Host $message
  if ($CopyHint) {
    Write-Host "Скопируйте папку программы целиком на диск компьютера (например на Рабочий стол) и откройте её оттуда."
  }
  exit 1
}

function Get-LaunchDrive {
  $path = (Resolve-Path $root).Path
  if ($path -match "^\\\\") {
    return [pscustomobject]@{ Kind = "network"; FileSystem = ""; DriveType = "Network" }
  }
  $letter = $path.Substring(0, 1)
  $vol = Get-Volume -DriveLetter $letter -ErrorAction SilentlyContinue
  if ($vol) {
    return [pscustomobject]@{
      Kind = "volume"
      FileSystem = [string]$vol.FileSystem
      DriveType = [string]$vol.DriveType
    }
  }
  $info = Get-PSDrive -Name $letter -ErrorAction SilentlyContinue
  if ($info -and $info.Provider.Name -eq "FileSystem") {
    $type = if ($info.DisplayRoot) { "Network" } else { "Unknown" }
    return [pscustomobject]@{ Kind = "psdrive"; FileSystem = ""; DriveType = $type }
  }
  return [pscustomobject]@{ Kind = "unknown"; FileSystem = ""; DriveType = "" }
}

function Test-OurApp {
  try {
    $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    $data = $res.Content | ConvertFrom-Json
    return ($data.app -eq "socdem-fsit" -and $data.ok -eq $true)
  } catch {
    return $false
  }
}

function Test-PortBusy {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", 3001, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne(800)
    if ($ok -and $client.Connected) {
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

function Stop-OurApp {
  if (-not (Test-OurApp)) {
    return
  }
  $tokenPath = Join-Path $root "data\control.token"
  if (Test-Path $tokenPath) {
    $token = (Get-Content $tokenPath -Raw).Trim()
    try {
      Invoke-WebRequest -Uri "http://127.0.0.1:3001/api/shutdown" -Method POST `
        -Headers @{ "x-socdem-stop" = $token } -UseBasicParsing -TimeoutSec 15 | Out-Null
    } catch {
      # ignore — fallback to lock file below
    }
    for ($i = 0; $i -lt 40; $i++) {
      if (-not (Test-OurApp)) {
        return
      }
      Start-Sleep -Milliseconds 500
    }
  }
  $lockPath = Join-Path $root "data\server.lock"
  if (Test-Path $lockPath) {
    $oldPid = [int]((Get-Content $lockPath -Raw).Trim())
    if ($oldPid -gt 0) {
      Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
      Start-Sleep -Seconds 2
    }
  }
}

$drive = Get-LaunchDrive
if ($drive.DriveType -eq "Network" -or $drive.Kind -eq "network") {
  Fail "Программу нельзя запускать с сетевой папки." -CopyHint
}
if ($drive.FileSystem -match "FAT") {
  Fail ("Этот диск не подходит (файловая система " + $drive.FileSystem + "). Скопируйте папку на диск компьютера в формате NTFS.") -CopyHint
}
if ($drive.DriveType -eq "Removable") {
  Fail "Не запускайте программу с флешки. Сначала скопируйте папку на диск компьютера, затем откройте её." -CopyHint
}
if ($drive.FileSystem -and $drive.FileSystem -ne "NTFS") {
  Fail ("Нужен диск NTFS. Сейчас указано: " + $drive.FileSystem + ".") -CopyHint
}

$required = @(
  @{ Path = "runtime\node\node.exe"; Hint = "нет встроенного движка" },
  @{ Path = "backend\src\index.js"; Hint = "нет сервера" },
  @{ Path = "backend\node_modules\@electric-sql\pglite\package.json"; Hint = "нет библиотек сервера" },
  @{ Path = "frontend\dist\index.html"; Hint = "нет готового сайта" },
  @{ Path = "data\pgdata\PG_VERSION"; Hint = "нет базы данных" }
)
foreach ($item in $required) {
  if (-not (Test-Path (Join-Path $root $item.Path))) {
    Fail ("Папка скопирована не целиком (" + $item.Hint + ").") -CopyHint
  }
}

$nodeExe = Join-Path $root "runtime\node\node.exe"

if (Test-OurApp) {
  Write-Host "База уже открыта — перезапускаю, чтобы подхватить обновления программы."
  Stop-OurApp
}

if (Test-PortBusy) {
  Fail "Адрес сайта занят другой программой. Закройте её или перезагрузите компьютер и попробуйте снова."
}

$env:SOCDEM_OPEN_BROWSER = "1"
$env:PATH = (Join-Path $root "runtime\node") + ";" + $env:PATH
Set-Location (Join-Path $root "backend")
Write-Host "Открываю базу..."
& $nodeExe src\index.js
if ($LASTEXITCODE -eq 76) {
  Write-Host "Рабочая база не открылась. Проверяю резервную копию..."
  & $nodeExe src\db.js --restore-cluster
  if ($LASTEXITCODE -ne 0) {
    Fail "Не удалось восстановить базу из копии."
  }
  Write-Host "Открываю базу после восстановления..."
  & $nodeExe src\index.js
}
exit $LASTEXITCODE