' Start-MarinaAI-Background.vbs
' Launches the full MarinaAI stack (Ollama GPU + Command Hub + Agent + Next.js)
' completely hidden in the background - no console windows at all.
' Double-click this file, or place a shortcut to it anywhere.

Set WshShell = CreateObject("WScript.Shell")

' 0 = hidden window, False = don't wait
WshShell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\linde\Projects\MarinaAI\dev-stack.ps1"" -All", 0, False

' Give the stack a moment to boot before finishing
WScript.Sleep 500