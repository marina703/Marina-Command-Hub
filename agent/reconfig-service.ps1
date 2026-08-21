# MarinaAI - Reconfigure service to PORT 3000 (avoid conflict with Next.js web on 3001)
# Run as Administrator

$ErrorActionPreference = "Continue"

$nssm = "C:\Users\linde\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe"
$appDir = "C:\Users\linde\Projects\MarinaAI\agent"
$serviceName = "MarinaAI"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Must run as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host "Stopping service..." -ForegroundColor Cyan
& $nssm stop $serviceName
Start-Sleep -Seconds 2

Write-Host "Setting PORT=3000 (Command Hub port, matches dev-stack.ps1)..." -ForegroundColor Cyan
& $nssm set $serviceName AppEnvironmentExtra "PORT=3000"
Write-Host "  exit: $LASTEXITCODE"

Write-Host "Verifying..." -ForegroundColor Cyan
Write-Host "AppEnvironment: $(& $nssm get $serviceName AppEnvironmentExtra)"

Write-Host "Starting service..." -ForegroundColor Cyan
& $nssm start $serviceName
Start-Sleep -Seconds 5

$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Service status: $($svc.Status)" -ForegroundColor Green
}

try {
    $conn = Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -WarningAction SilentlyContinue
    if ($conn.TcpTestSucceeded) {
        Write-Host "Port 3000 OPEN - Command Hub live at http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "Port 3000 not responding. Check service-out.log / service-err.log" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not test port." -ForegroundColor Yellow
}
