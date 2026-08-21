# MarinaAI - Fix service config and start
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

Write-Host "Setting AppDirectory..." -ForegroundColor Cyan
& $nssm set $serviceName AppDirectory $appDir
Write-Host "  exit: $LASTEXITCODE"

Write-Host "Setting AppEnvironmentExtra PORT=3001..." -ForegroundColor Cyan
& $nssm set $serviceName AppEnvironmentExtra "PORT=3001"
Write-Host "  exit: $LASTEXITCODE"

Write-Host "Setting AppStdout..." -ForegroundColor Cyan
& $nssm set $serviceName AppStdout "$appDir\service-out.log"
Write-Host "  exit: $LASTEXITCODE"

Write-Host "Setting AppStderr..." -ForegroundColor Cyan
& $nssm set $serviceName AppStderr "$appDir\service-err.log"
Write-Host "  exit: $LASTEXITCODE"

Write-Host "Setting AppExit Default Restart..." -ForegroundColor Cyan
& $nssm set $serviceName AppExit Default Restart
Write-Host "  exit: $LASTEXITCODE"

Write-Host "Setting AppRestartDelay 5000..." -ForegroundColor Cyan
& $nssm set $serviceName AppRestartDelay 5000
Write-Host "  exit: $LASTEXITCODE"

Write-Host ""
Write-Host "Verifying config..." -ForegroundColor Cyan
Write-Host "AppDirectory:    $(& $nssm get $serviceName AppDirectory)"
Write-Host "AppEnvironment:  $(& $nssm get $serviceName AppEnvironmentExtra)"
Write-Host "AppStdout:       $(& $nssm get $serviceName AppStdout)"
Write-Host "AppStderr:       $(& $nssm get $serviceName AppStderr)"

Write-Host ""
Write-Host "Starting service..." -ForegroundColor Cyan
& $nssm start $serviceName
Write-Host "  start exit: $LASTEXITCODE"

Start-Sleep -Seconds 5

$svc = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
if ($svc) {
    Write-Host "Service status: $($svc.Status)" -ForegroundColor Green
}

try {
    $conn = Test-NetConnection -ComputerName localhost -Port 3001 -WarningAction SilentlyContinue
    if ($conn.TcpTestSucceeded) {
        Write-Host "Port 3001 OPEN - dashboard live at http://localhost:3001" -ForegroundColor Green
    } else {
        Write-Host "Port 3001 not responding. Check service-out.log / service-err.log" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not test port." -ForegroundColor Yellow
}
