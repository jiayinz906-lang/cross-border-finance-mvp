param(
  [switch] $NoRestartPorts
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$bundledNodeBin = Join-Path $runtimeRoot "node\bin"
$bundledPnpm = Join-Path $runtimeRoot "bin\pnpm.cmd"
$pnpm = if (Test-Path $bundledPnpm) { $bundledPnpm } else { "pnpm" }

if (Test-Path (Join-Path $bundledNodeBin "node.exe")) {
  $env:PATH = "$bundledNodeBin;$env:PATH"
}

function Stop-PortListener {
  param([int] $Port)

  $listeners = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

  foreach ($processId in $listeners) {
    if ($processId -and $processId -ne $PID) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Start-FinanceWindow {
  param(
    [string] $Title,
    [string] $Command
  )

  $escapedTitle = $Title.Replace("'", "''")
  $escapedRoot = $projectRoot.Replace("'", "''")
  $escapedCommand = $Command.Replace("'", "''")
  $fullCommand = "`$host.UI.RawUI.WindowTitle = '$escapedTitle'; Set-Location '$escapedRoot'; $escapedCommand"

  Start-Process powershell.exe -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-Command", $fullCommand
  )
}

if (-not $NoRestartPorts) {
  Stop-PortListener -Port 4000
  Stop-PortListener -Port 5173
}

Write-Host "Preparing database..."
& $pnpm prisma:deploy

$backendCommand = "`$env:PATH='$bundledNodeBin;' + `$env:PATH; `$env:PORT='4000'; & '$pnpm' --filter cross-border-finance-server dev"
$frontendCommand = "`$env:PATH='$bundledNodeBin;' + `$env:PATH; `$env:VITE_API_BASE_URL='http://localhost:4000/api'; & '$pnpm' --filter cross-border-finance-client dev -- --host localhost --port 5173"

Start-FinanceWindow -Title "XJD Finance API :4000" -Command $backendCommand
Start-Sleep -Seconds 2
Start-FinanceWindow -Title "XJD Finance Web :5173" -Command $frontendCommand

Write-Host ""
Write-Host "XJD Finance local system is starting."
Write-Host "Frontend:  http://localhost:5173/"
Write-Host "Dashboard: http://localhost:5173/#/dashboard"
Write-Host "Backend:   http://localhost:4000/api"
Write-Host "Health:    http://localhost:4000/api/health"
Write-Host "Ready:     http://localhost:4000/api/health/ready?month=2026-06"
Write-Host ""
Write-Host "Run verification after both windows are ready:"
Write-Host "pnpm verify:all"
