# ollama-turbo.ps1
# GPU-accelerated Ollama launcher for MarinaAI
# Tuned for: Ryzen AI 5 430 + 16 GB RAM + AMD Radeon 840M iGPU (Vulkan)
# Usage: powershell -ExecutionPolicy Bypass -File .\ollama-turbo.ps1 [-KeepAlive 30m] [-Bench]

param(
    [string]$KeepAlive = "30m",
    [switch]$Bench
)

$ErrorActionPreference = "Stop"

# Paths
$OllamaExe = "C:\Users\linde\AppData\Local\Programs\Ollama\ollama.exe"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LogDir = Join-Path $ProjectRoot "logs"
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ── Speed-optimized environment (GPU via Vulkan + iGPU) ──────────────────────
# OLLAMA_IGPU_ENABLE is the critical fix: without it Ollama drops the Radeon
# 840M (an iGPU) and every model silently runs 100% CPU.
$env:OLLAMA_VULKAN         = "1"
$env:OLLAMA_IGPU_ENABLE    = "1"
$env:OLLAMA_KV_CACHE_TYPE  = "q8_0"      # Halves KV-cache RAM (q8_0 quantized)
$env:OLLAMA_FLASH_ATTENTION = "1"          # Faster attention on supported archs
$env:OLLAMA_CONTEXT_LENGTH = "4096"        # Modest context for iGPU shared RAM
$env:OLLAMA_KEEP_ALIVE     = $KeepAlive    # Keep 1 model warm between calls
$env:OLLAMA_MAX_LOADED_MODELS = "1"        # Only 1 model in RAM at a time
$env:OLLAMA_NUM_PARALLEL   = "1"

function Test-Port($Port) {
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $connect = $tcp.BeginConnect("127.0.0.1", $Port, $null, $null)
        $wait = $connect.AsyncWaitHandle.WaitOne(800, $false)
        if ($wait) {
            $tcp.EndConnect($connect)
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

Write-Host "=== Ollama Turbo (GPU/Vulkan) ===" -ForegroundColor Cyan
Write-Host "VULKAN=$env:OLLAMA_VULKAN IGPU=$env:OLLAMA_IGPU_ENABLE KV=$env:OLLAMA_KV_CACHE_TYPE CTX=$env:OLLAMA_CONTEXT_LENGTH KEEP_ALIVE=$env:OLLAMA_KEEP_ALIVE" -ForegroundColor Green

# ── Restart any existing Ollama so the GPU env vars are actually applied ──────
# (The Ollama tray app relaunches the server without these vars → 100% CPU.)
Get-Process -Name "ollama", "ollama app" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "llama-server" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 3

Write-Host "Starting Ollama server (hidden, GPU enabled)..." -ForegroundColor Cyan
$outLog = Join-Path $LogDir "ollama.out.log"
$errLog = Join-Path $LogDir "ollama.err.log"
$server = Start-Process -FilePath $OllamaExe -ArgumentList "serve" -WindowStyle Hidden `
    -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru

# Wait for the API to come up (max 30s)
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    if (Test-Port 11434) { $ready = $true; break }
    if ($server.HasExited) { break }
    Start-Sleep -Seconds 1
}

if (-not $ready) {
    Write-Host "[ERROR] Ollama did not start within 30s. Check $errLog" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Ollama API active at http://localhost:11434/" -ForegroundColor Green
Write-Host "     Logs: $outLog  /  $errLog" -ForegroundColor DarkGray

if ($Bench) {
    Write-Host "Quick GPU verification (loading qwen2.5:3b)..." -ForegroundColor Cyan
    $body = @{
        model   = "qwen2.5:3b"
        prompt  = "Reply with the single word: ready"
        stream  = $false
        options = @{ num_predict = 5; temperature = 0 }
    } | ConvertTo-Json -Depth 4
    try {
        Invoke-RestMethod -Uri "http://127.0.0.1:11434/api/generate" -Method Post -Body $body -ContentType "application/json" -TimeoutSec 60 | Out-Null
        & ollama.exe ps
    } catch {
        Write-Host "[WARN] Could not verify GPU load: $_" -ForegroundColor Yellow
    }
}

Write-Host "Run 'ollama ps' - every model should show 100% GPU." -ForegroundColor Green
