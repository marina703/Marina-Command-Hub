# MarinaAI - Create desktop shortcut to open the Command Hub dashboard
# Does NOT require admin (writes to user's Desktop)

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop "MarinaAI Command Hub.lnk"

$ws = New-Object -ComObject WScript.Shell
$sc = $ws.CreateShortcut($shortcutPath)
$sc.TargetPath = "http://localhost:3000"
$sc.Description = "Open MarinaAI Command Hub dashboard"
$sc.IconLocation = "C:\Program Files\nodejs\node.exe,0"
$sc.Save()

if (Test-Path $shortcutPath) {
    Write-Host "Shortcut created: $shortcutPath" -ForegroundColor Green
} else {
    Write-Host "Failed to create shortcut." -ForegroundColor Red
}
