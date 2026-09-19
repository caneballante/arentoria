param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeDir = Join-Path $appDir ".runtime"
$pidFile = Join-Path $runtimeDir "dev-server.pid"
$stdoutLog = Join-Path $runtimeDir "dev-server.out.log"
$stderrLog = Join-Path $runtimeDir "dev-server.err.log"
$appUrl = "http://127.0.0.1:3000/"

function Test-ArentoriaReady {
  try {
    $response = Invoke-WebRequest -Uri $appUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.Content -match "Arentoria"
  } catch {
    return $false
  }
}

if (Test-ArentoriaReady) {
  if (-not $NoBrowser) { Start-Process $appUrl }
  Write-Output "Arentoria is already running. Opened $appUrl"
  exit 0
}

$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
  Write-Error "Port 3000 is already being used by another application. Stop it before starting Arentoria."
  exit 1
}

$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npm) {
  Write-Error "npm was not found. Install Node.js or add npm to PATH."
  exit 1
}

New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
Remove-Item -LiteralPath $stdoutLog, $stderrLog -Force -ErrorAction SilentlyContinue

$server = Start-Process `
  -FilePath $npm.Source `
  -ArgumentList @("run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000") `
  -WorkingDirectory $appDir `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

Set-Content -LiteralPath $pidFile -Value $server.Id -Encoding ascii

for ($attempt = 0; $attempt -lt 60; $attempt++) {
  Start-Sleep -Milliseconds 500
  if ($server.HasExited) { break }
  if (Test-ArentoriaReady) {
    if (-not $NoBrowser) { Start-Process $appUrl }
    Write-Output "Arentoria started. URL: $appUrl"
    exit 0
  }
}

if (-not $server.HasExited) {
  & taskkill.exe /PID $server.Id /T /F 2>&1 | Out-Null
}
Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue

$details = if (Test-Path -LiteralPath $stderrLog) {
  (Get-Content -LiteralPath $stderrLog -Tail 12 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
} else {
  "No error log was produced."
}
Write-Error "Arentoria did not become ready within 30 seconds.`n$details"
exit 1
