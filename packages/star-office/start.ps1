$ErrorActionPreference = 'Stop'
$runtime = 'D:\agentic-os\star-office'
$sha = 'f29c107e9728a72f2635f10b4e8203b29b37221d'
$source = Join-Path $runtime "source\Star-Office-UI-$sha"
$venvPython = Join-Path $runtime 'venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $source)) {
    New-Item -ItemType Directory -Force -Path $runtime | Out-Null
    Invoke-WebRequest -Uri "https://codeload.github.com/ringhyacinth/Star-Office-UI/zip/$sha" -OutFile (Join-Path $runtime 'upstream.zip')
    Expand-Archive -LiteralPath (Join-Path $runtime 'upstream.zip') -DestinationPath (Join-Path $runtime 'source') -Force
}
if (-not (Test-Path -LiteralPath $venvPython)) {
    py -3.11 -m venv (Join-Path $runtime 'venv')
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 is required for Star Office.' }
}
& $venvPython -c 'import flask, PIL'
if ($LASTEXITCODE -ne 0) {
    & $venvPython -m pip install -r (Join-Path $source 'backend\requirements.txt')
    if ($LASTEXITCODE -ne 0) { throw 'Star Office dependency installation failed.' }
}
& $venvPython (Join-Path $PSScriptRoot 'run.py')
exit $LASTEXITCODE
