@echo off
REM ============================================================
REM  Start-MarinaAI-Background.bat
REM  One-click hidden start of the full MarinaAI stack:
REM    - Ollama (GPU/Vulkan turbo)
REM    - Command Hub (port 3000)
REM    - Agent listener
REM    - Next.js web (port 3001)
REM
REM  Launches via VBScript so NO console windows appear at all.
REM  Close this window once done - the stack keeps running hidden.
REM ============================================================

wscript.exe "C:\Users\linde\Projects\MarinaAI\Start-MarinaAI-Background.vbs"

echo.
echo  MarinaAI stack started hidden in the background.
echo  Command Hub:   http://localhost:3000
echo  Next.js web:   http://localhost:3001
echo  Ollama API:    http://localhost:11434
echo.
echo  Logs:          C:\Users\linde\Projects\MarinaAI\logs
echo  Status check:  powershell -File C:\Users\linde\Projects\MarinaAI\dev-stack.ps1 -Doctor
echo.

timeout /t 3 /nobreak >nul
exit