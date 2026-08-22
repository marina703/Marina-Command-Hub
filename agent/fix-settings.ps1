$path = Join-Path $env:APPDATA 'Code - Insiders\User\settings.json'
$content = @'
{
  "files.autoSave": "afterDelay",
  "editor.formatOnSave": true,
  "editor.tabSize": 2,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "terminal.integrated.defaultProfile.windows": "PowerShell",
  "git.confirmSync": false,
  "git.autofetch": true,
  "explorer.confirmDelete": false,
  "ollama-autopilot.model.modelName": "qwen2.5:3b",
  "github.copilot.llm-gateway.serverUrl": "http://localhost:11434",
  "github.copilot.llm-gateway.enableInlineCompletion": true,
  "@azure.argTenant": "",
  "chat.hookFilesLocations": {
    ".github/hooks": true,
    ".claude/settings.local.json": true,
    ".claude/settings.json": true,
    "~/.copilot/hooks": true,
    "~/.claude/settings.json": true,
    "~/.agents/hooks": true
  },
  "cline.allowFileOperations": true,
  "cline.allowShellCommands": true,
  "freeAI.custom.providers": [
    {
      "id": "ollama",
      "name": "OLLAMA",
      "baseUrl": "http://localhost:11434/v1",
      "enabled": true,
      "noApiKey": true,
      "maxInputTokens": 128000,
      "maxOutputTokens": 8192,
      "toolCalling": true,
      "imageInput": true,
      "thinking": true
    }
  ],
  "freeAI.suggestions.enabled": true,
  "freeAI.fix.model": "custom:ollama/qwen2.5-coder:latest",
  "git.enableSmartCommit": true,
  "extensions.autoRestart": true
}
'@
$dir = Split-Path $path -Parent
if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
[System.IO.File]::WriteAllText($path, $content, [System.Text.UTF8Encoding]::new($false))
Write-Host "Wrote: $path"
# Validate JSON
try {
  Get-Content $path -Raw | ConvertFrom-Json | Out-Null
  Write-Host "Valid JSON"
} catch {
  Write-Host "Invalid JSON: $_"
}
