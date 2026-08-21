# MarinaAI - Restart the Windows service (picks up updated playbooks.js)
# Run as Administrator

$nssm = "C:\Users\linde\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe"
$serviceName = "MarinaAI"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "ERROR: Must run as Administrator." -ForegroundColor Red
    exit 1
}

Write-Host "Restarting service $serviceName..." -ForegroundColor Cyan
& $nssm restart $serviceName
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
        Write-Host "Port 3000 not responding." -ForegroundColor Yellow
    }
} catch {
    Write-Host "Could not test port." -ForegroundColor Yellow
}
