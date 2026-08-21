# MarinaAI Dashboard Server - Windows Service Installer
# Run this script as Administrator (right-click -> Run with PowerShell as admin)
# Or from an elevated terminal:  powershell -ExecutionPolicy Bypass -File install-service.ps1

$ErrorActionPreference = "Stop"

# --- Paths ---
$nssm = "C:\Users\linde\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe"
$node = "C:\Program Files\nodejs\node.exe"
$appDir = "C:\Users\linde\Projects\MarinaAI\agent"
$serviceName = "MarinaAI"

# --- Verify admin ---
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator." -ForegroundColor Red
    Write-Host "Right-click PowerShell and select 'Run as administrator', then re-run this script."
    exit 1
}

# --- Verify nssm exists ---
if (-not (Test-Path $nssm)) {
    Write-Host "ERROR: nssm.exe not found at: $nssm" -ForegroundColor Red
    Write-Host "Install it with:  winget install --id NSSM.NSSM -e"
    exit 1
}

Write-Host "Installing Windows service '$serviceName'..." -ForegroundColor Cyan

# --- Remove existing service if present ---
& $nssm stop $serviceName 2>$null | Out-Null
& $nssm remove $serviceName confirm 2>$null | Out-Null

# --- Install ---
& $nssm install $serviceName $node "dashboard-server.js"
if ($LASTEXITCODE -ne 0) { Write-Host "install failed"; exit 1 }

# --- Configure ---
& $nssm set $serviceName AppDirectory $appDir
& $nssm set $serviceName AppEnvironmentExtra "PORT=3001"
& $nssm set $serviceName AppStdout "$appDir\service-out.log"
& $nssm set $serviceName AppStderr "$appDir\service-err.log"
& $nssm set $serviceName AppRotateFiles 1
& $nssm set $serviceName AppRotateBytes 10485760
& $nssm set $serviceName Start SERVICE_AUTO_START
& $nssm set $serviceName AppExit Default Restart
& $nssm set $serviceName AppRestartDelay 5000
& $nssm set $serviceName DisplayName "MarinaAI Command Hub"
& $nssm set $serviceName Description "MarinaAI autonomous operations dashboard server (Node.js on port 3001)."

Write-Host "Service configured. Starting..." -ForegroundColor Cyan
& $nssm start $serviceName

Start-Sleep -Seconds 3

# --- Verify ---
$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host ""
    Write-Host "Service status: $($svc.Status)" -ForegroundColor Green
    Write-Host "Start type:    $($svc.StartType)"
} else {
    Write-Host "Service not found after install." -ForegroundColor Red
}

# --- Check port 3001 ---
try {
    $conn = Test-NetConnection -ComputerName localhost -Port 3001 -WarningAction SilentlyContinue
    if ($conn.TcpTestSucceeded) {
        Write-Host "Port 3001 is OPEN - dashboard should be live at http://localhost:3001" -ForegroundColor Green
    } else {
        Write-Host "Port 3001 not responding yet. Check service-out.log / service-err.log" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not test port 3001." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Management commands:" -ForegroundColor Cyan
Write-Host "  Start:    nssm start $serviceName"
Write-Host "  Stop:     nssm stop $serviceName"
Write-Host "  Restart:  nssm restart $serviceName"
Write-Host "  Status:   Get-Service $serviceName"
Write-Host "  Remove:   nssm remove $serviceName confirm"
Write-Host ""
Write-Host "Logs: $appDir\service-out.log and $appDir\service-err.log"
