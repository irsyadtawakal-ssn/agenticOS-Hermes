# Memasang launcher Startup (tanpa admin) yang menjalankan OS Core saat login.
param([string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path)
$ErrorActionPreference = "Stop"
$startup = [Environment]::GetFolderPath("Startup")
$target = Join-Path $startup "AgenticOS_Core.vbs"
$logDir = "D:\agentic-os\core"
New-Item -ItemType Directory -Force $logDir | Out-Null
$cmd = "cmd /c cd /d `"`"$RepoRoot`"`" && pnpm -F @aos/core start >> `"`"$logDir\core.log`"`" 2>&1"
$vbs = @"
Set sh = CreateObject("WScript.Shell")
sh.Run "$cmd", 0, False
"@
Set-Content -Path $target -Value $vbs -Encoding ASCII
Write-Output "Installed $target"
