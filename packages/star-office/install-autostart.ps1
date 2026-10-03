$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$python = 'D:\agentic-os\star-office\venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Run pnpm star-office:start once to install the runtime.' }
$startup = [Environment]::GetFolderPath('Startup')
$launcher = Join-Path $startup 'AgenticOS_StarOffice.vbs'
$script = Join-Path $repo 'packages\star-office\run.py'
$command = "`"$python`" `"$script`""
$vbsCommand = $command.Replace('"', '""')
@"
Set shell = CreateObject("WScript.Shell")
shell.Run "$vbsCommand", 0, False
"@ | Set-Content -LiteralPath $launcher -Encoding ASCII
Write-Output 'Star Office will start hidden on the next Windows login.'
