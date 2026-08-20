# dev-stack.ps1
# Unified runner & orchestrator for MarinaAI dev + agent + command center stack

param(
    [switch]$Dashboard,
    [switch]$Agent,
    [switch]$Web,
    [switch]$Supabase,
    [switch]$LLM,
    [switch]$WebUI,
    [switch]$All,
    [switch]$Doctor,
    [switch]$EnableAutostart,
    [switch]$DisableAutostart
)

$ProjectRoot = $PSScriptRoot
if (-not $ProjectRoot) {
    $ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}
$AgentDir = Join-Path $ProjectRoot "agent"
$WebDir   = Join-Path $ProjectRoot "web"
$LogDir   = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Check-Port($Port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connect = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(800, $false)
        if (-not $wait) {
            $tcp.Close()
            return $false
        }
        $tcp.EndConnect($connect)
        $tcp.Close()
        return $true
    } catch {
        return $false
    }
}

function Show-Doctor {
    Write-Host "`n=== Marina AI Command Hub Health Check ===" -ForegroundColor Cyan
    
    # 1. Command Hub
    $dashUp = Check-Port 3000
    if ($dashUp) {
        Write-Host "[OK] Command Hub active at http://localhost:3000" -ForegroundColor Green
    } else {
        Write-Host "[--] Command Hub (Port 3000) not running" -ForegroundColor Yellow
    }

    # 2. Ollama Local LLM
    $ollamaUp = Check-Port 11434
    if ($ollamaUp) {
        Write-Host "[OK] Ollama API active at http://localhost:11434" -ForegroundColor Green
    } else {
        Write-Host "[--] Ollama (Port 11434) not running" -ForegroundColor Yellow
    }

    # 3. Next.js Web
    $webUp = Check-Port 3001
    if ($webUp) {
        Write-Host "[OK] Next.js frontend active at http://localhost:3001" -ForegroundColor Green
    } else {
        Write-Host "[--] Next.js frontend (Port 3001) not running" -ForegroundColor Yellow
    }

    # 4. Agent Files & Permissions
    $permFile = Join-Path $AgentDir "permissions.json"
    if (Test-Path $permFile) {
        Write-Host "[OK] Agent permissions file found" -ForegroundColor Green
    } else {
        Write-Host "[WARN] permissions.json missing in agent/" -ForegroundColor Red
    }

    Write-Host "==========================================`n" -ForegroundColor Cyan
}

function Start-Dashboard {
    Write-Host "Starting Marina AI Command Hub (Port 3000)..." -ForegroundColor Cyan
    Push-Location $AgentDir
    node dashboard-server.js
    Pop-Location
}

function Start-Agent {
    Write-Host "Starting MarinaAI Autonomous Listener..." -ForegroundColor Cyan
    Push-Location $AgentDir
    node listener.js
    Pop-Location
}

function Start-Web {
    Write-Host "Starting Next.js dev server..." -ForegroundColor Cyan
    Push-Location $WebDir
    npm run dev -- -p 3001
    Pop-Location
}

function Start-Supabase {
    Write-Host "Starting Supabase local stack..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    supabase start
    Pop-Location
}

function Start-LLM {
    Write-Host "Starting Ollama (GPU/Vulkan turbo)..." -ForegroundColor Cyan
    $turbo = Join-Path $AgentDir "ollama-turbo.ps1"
    if (Test-Path $turbo) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $turbo
    } else {
        ollama serve
    }
}

function Start-BackgroundStack {
    $turbo = Join-Path $AgentDir "ollama-turbo.ps1"
    $dashOut = Join-Path $LogDir "dashboard.out.log"
    $dashErr = Join-Path $LogDir "dashboard.err.log"
    $lisOut  = Join-Path $LogDir "listener.out.log"
    $lisErr  = Join-Path $LogDir "listener.err.log"
    $webOut  = Join-Path $LogDir "web.out.log"
    $webErr  = Join-Path $LogDir "web.err.log"

    Write-Host "Starting Ollama (GPU turbo)..." -ForegroundColor Cyan
    Start-Process powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $turbo -WindowStyle Hidden

    Write-Host "Starting Command Hub (3000)..." -ForegroundColor Cyan
    Start-Process node.exe -ArgumentList "dashboard-server.js" -WorkingDirectory $AgentDir -WindowStyle Hidden -RedirectStandardOutput $dashOut -RedirectStandardError $dashErr

    Write-Host "Starting Agent listener..." -ForegroundColor Cyan
    Start-Process node.exe -ArgumentList "listener.js" -WorkingDirectory $AgentDir -WindowStyle Hidden -RedirectStandardOutput $lisOut -RedirectStandardError $lisErr

    Write-Host "Starting Next.js web (3001)..." -ForegroundColor Cyan
    Start-Process powershell.exe -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "Set-Location '$WebDir'; npm run dev -- -p 3001" -WindowStyle Hidden -RedirectStandardOutput $webOut -RedirectStandardError $webErr

    Start-Sleep -Seconds 4
    Write-Host "All services started in background (no windows)." -ForegroundColor Green
    Write-Host "Logs: $LogDir" -ForegroundColor DarkGray
}

function Start-WebUI {
    Write-Host "Starting Open WebUI..." -ForegroundColor Cyan
    open-webui serve
}

function Set-Autostart {
    $startupDir = [System.Environment]::GetFolderPath('Startup')
    $cmdPath = Join-Path $startupDir "MarinaAI-Startup.cmd"
    $vbsPath = Join-Path $ProjectRoot "Start-MarinaAI-Background.vbs"

    # One hidden VBS launches everything (Ollama GPU + hub + agent + web).
    # No console windows appear at login.
    $cmdContent = "@echo off`r`nwscript.exe `"$vbsPath`""

    Set-Content -Path $cmdPath -Value $cmdContent -Encoding ASCII

    # The Ollama tray app relaunches the server WITHOUT the GPU env vars,
    # silently reverting models to 100% CPU. Disable it at startup.
    $ollamaLnk = Join-Path $startupDir "Ollama.lnk"
    $ollamaLnkDisabled = Join-Path $startupDir "Ollama.lnk.disabled"
    if (Test-Path $ollamaLnk) {
        Move-Item $ollamaLnk $ollamaLnkDisabled -Force
        Write-Host "[OK] Disabled Ollama tray autostart (renamed Ollama.lnk)" -ForegroundColor Yellow
    }

    Write-Host "[OK] Windows Autostart Enabled (hidden full stack)!" -ForegroundColor Green
    Write-Host "Ollama (GPU) + Command Hub + Agent + Next.js start in background at logon." -ForegroundColor Cyan
    Write-Host "Startup batch file created at: $cmdPath" -ForegroundColor DarkGray
}

function Remove-Autostart {
    $startupDir = [System.Environment]::GetFolderPath('Startup')
    $cmdPath = Join-Path $startupDir "MarinaAI-Startup.cmd"
    if (Test-Path $cmdPath) {
        Remove-Item -Force $cmdPath
        Write-Host "[OK] Windows Autostart Disabled." -ForegroundColor Yellow
    } else {
        Write-Host "[INFO] Autostart was not configured." -ForegroundColor Gray
    }

    # Restore the Ollama tray app if we disabled it previously
    $ollamaLnkDisabled = Join-Path $startupDir "Ollama.lnk.disabled"
    if (Test-Path $ollamaLnkDisabled) {
        Move-Item $ollamaLnkDisabled (Join-Path $startupDir "Ollama.lnk") -Force
        Write-Host "[OK] Restored Ollama tray autostart." -ForegroundColor Yellow
    }
}

if ($EnableAutostart) {
    Set-Autostart
    exit
}

if ($DisableAutostart) {
    Remove-Autostart
    exit
}

if ($Doctor) {
    Show-Doctor
    exit
}

if ($All) {
    Write-Host "Starting full MarinaAI stack in background (hidden)..." -ForegroundColor Green
    Start-BackgroundStack
    Write-Host "Stack launched! Open http://localhost:3000 for the Command Center." -ForegroundColor Green
    Write-Host "All services are hidden - logs at: $LogDir" -ForegroundColor DarkGray
    exit
}

if ($Dashboard) { Start-Dashboard }
if ($Agent)     { Start-Agent }
if ($Web)       { Start-Web }
if ($Supabase)  { Start-Supabase }
if ($LLM)       { Start-LLM }
if ($WebUI)     { Start-WebUI }

if (-not ($Dashboard -or $Agent -or $Web -or $Supabase -or $LLM -or $WebUI -or $All -or $Doctor -or $EnableAutostart -or $DisableAutostart)) {
    Write-Host "Usage: .\dev-stack.ps1 [-Dashboard] [-Agent] [-Web] [-Supabase] [-LLM] [-All] [-Doctor] [-EnableAutostart] [-DisableAutostart]" -ForegroundColor Yellow
}
