param(
  [Parameter(Mandatory = $true)][string]$InputPath,
  [Parameter(Mandatory = $true)][string]$OutputPath,
  [ValidateSet("pixels", "bust")][string]$Mode = "pixels",
  [int]$X = 0,
  [int]$Y = 0,
  [int]$Width = 0,
  [int]$Height = 0
)
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Get-SubjectBox([System.Drawing.Bitmap]$bmp) {
  $w = $bmp.Width
  $h = $bmp.Height
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $data = $bmp.LockBits(
    $rect,
    [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  try {
    $stride = $data.Stride
    $ptr = $data.Scan0
    $n = $stride * $h
    $bytes = New-Object byte[] $n
    [System.Runtime.InteropServices.Marshal]::Copy($ptr, $bytes, 0, $n)
    $minX = $w
    $minY = $h
    $maxX = -1
    $maxY = -1
    for ($y = 0; $y -lt $h; $y++) {
      $row = $y * $stride
      for ($x = 0; $x -lt $w; $x++) {
        $i = $row + ($x * 4)
        $b = $bytes[$i]
        $g = $bytes[$i + 1]
        $r = $bytes[$i + 2]
        $a = $bytes[$i + 3]
        if ($a -lt 12) { continue }
        if ($r -gt 245 -and $g -gt 245 -and $b -gt 245) { continue }
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  finally {
    $bmp.UnlockBits($data)
  }
  if ($maxX -lt $minX) { return $null }
  return @{
    X = $minX
    Y = $minY
    W = ($maxX - $minX + 1)
    H = ($maxY - $minY + 1)
  }
}

function Copy-Crop(
  [System.Drawing.Image]$img,
  [int]$sx,
  [int]$sy,
  [int]$sw,
  [int]$sh
) {
  if ($sw -lt 8 -or $sh -lt 8) { throw "crop too small" }
  $dest = New-Object System.Drawing.Bitmap $sw, $sh, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $dest.SetResolution($img.HorizontalResolution, $img.VerticalResolution)
  $g = [System.Drawing.Graphics]::FromImage($dest)
  try {
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $src = New-Object System.Drawing.Rectangle $sx, $sy, $sw, $sh
    $dst = New-Object System.Drawing.Rectangle 0, 0, $sw, $sh
    $g.DrawImage($img, $dst, $src, [System.Drawing.GraphicsUnit]::Pixel)
  }
  finally {
    $g.Dispose()
  }
  return $dest
}

$img = [System.Drawing.Image]::FromFile($InputPath)
$bmp = New-Object System.Drawing.Bitmap $img
$img.Dispose()
try {
  $sx = 0
  $sy = 0
  $sw = $bmp.Width
  $sh = $bmp.Height

  if ($Mode -eq "bust") {
    $box = Get-SubjectBox $bmp
    if ($null -eq $box) { throw "no subject" }
    $silhouette = $box.H / [double]$box.W
    # Уже кадр по грудь (силуэт не в полный рост) — не режем повторно
    if ($silhouette -lt 1.9) {
      $bmp.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
      return
    }
    $padTop = [int]($box.H * 0.08)
    $padX = [int]($box.W * 0.18)
    $sx = [Math]::Max(0, $box.X - $padX)
    $sy = [Math]::Max(0, $box.Y - $padTop)
    $right = [Math]::Min($bmp.Width, $box.X + $box.W + $padX)
    $bottom = [Math]::Min($bmp.Height, $box.Y + [int]($box.H * 0.48))
    $sw = $right - $sx
    $sh = $bottom - $sy
  }
  else {
    $sx = [Math]::Max(0, $X)
    $sy = [Math]::Max(0, $Y)
    $sw = if ($Width -gt 0) { $Width } else { $bmp.Width - $sx }
    $sh = if ($Height -gt 0) { $Height } else { $bmp.Height - $sy }
    if ($sx + $sw -gt $bmp.Width) { $sw = $bmp.Width - $sx }
    if ($sy + $sh -gt $bmp.Height) { $sh = $bmp.Height - $sy }
  }

  $dir = Split-Path -Parent $OutputPath
  if ($dir -and -not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
  $cropped = Copy-Crop $bmp $sx $sy $sw $sh
  try {
    $cropped.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $cropped.Dispose()
  }
}
finally {
  $bmp.Dispose()
}
