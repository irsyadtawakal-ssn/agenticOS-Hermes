# Mengisi key 9Router per profile + token Agentic OS ke .env.local tanpa menampilkan nilainya.
param([string]$EnvFile = (Join-Path $PSScriptRoot "..\..\.env.local"))
$ErrorActionPreference = "Stop"
$EnvFile = [IO.Path]::GetFullPath($EnvFile)

function Set-EnvLine([string]$Name, [string]$Value) {
  $lines = if (Test-Path $EnvFile) { [IO.File]::ReadAllLines($EnvFile) } else { @() }
  $found = $false
  $out = foreach ($l in $lines) { if ($l -match "^$Name=") { $found = $true; "$Name=$Value" } else { $l } }
  if (-not $found) { $out = @($out) + "$Name=$Value" }
  [IO.File]::WriteAllLines($EnvFile, [string[]]$out)
}

function New-Token {
  $b = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ($b | ForEach-Object { $_.ToString("x2") }) -join ""
}

foreach ($p in "CHIEF", "RESEARCHER", "SECRETARY", "CONTENT", "DEV") {
  $s = Read-Host "API key 9Router 'aos-$($p.ToLower())' (Enter = lewati)" -AsSecureString
  $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
  if ($v) { Set-EnvLine "AOS_ROUTER_KEY_$p" $v }
}
foreach ($t in "AOS_BRIDGE_TOKEN", "AOS_UI_TOKEN", "AOS_APPROVER_TOKEN") {
  $has = (Test-Path $EnvFile) -and (Select-String -Path $EnvFile -Pattern "^$t=.+" -Quiet)
  if (-not $has) { Set-EnvLine $t (New-Token) }
}
if (-not (Select-String -Path $EnvFile -Pattern "^AOS_CORE_URL=" -Quiet)) { Set-EnvLine "AOS_CORE_URL" "http://127.0.0.1:7400" }
Write-Output "OK: $EnvFile diperbarui (nilai tidak ditampilkan)."
