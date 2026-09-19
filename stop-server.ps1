$ErrorActionPreference = "Stop"

$appDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidFile = Join-Path $appDir ".runtime\dev-server.pid"

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Output "Arentoria is not running from the Start Arentoria shortcut."
  exit 0
}

$serverPidText = (Get-Content -LiteralPath $pidFile -Raw).Trim()
$serverPid = 0
if (-not [int]::TryParse($serverPidText, [ref]$serverPid)) {
  Remove-Item -LiteralPath $pidFile -Force
  Write-Error "The Arentoria server record was invalid and has been cleared."
  exit 1
}

$serverProcess = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if (-not $serverProcess) {
  Remove-Item -LiteralPath $pidFile -Force
  Write-Output "Arentoria was already stopped."
  exit 0
}

& taskkill.exe /PID $serverPid /T /F 2>&1 | Out-Null

for ($attempt = 0; $attempt -lt 20; $attempt++) {
  Start-Sleep -Milliseconds 250
  if (-not (Get-Process -Id $serverPid -ErrorAction SilentlyContinue)) { break }
}

Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
Write-Output "Arentoria stopped."
