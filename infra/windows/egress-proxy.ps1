# Membuat network internal aos-egress + proxy allowlist (Squid) untuk sandbox dev. Idempoten.
$ErrorActionPreference = "Stop"
$conf = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\docker\egress\squid.conf"))

function Invoke-Docker([string[]]$DockerArgs) {
  $out = & docker @DockerArgs
  if ($LASTEXITCODE -ne 0) { throw "docker $($DockerArgs -join ' ') gagal (exit $LASTEXITCODE)" }
  $out
}

if (-not (Invoke-Docker @("network", "ls", "--filter", "name=^aos-egress$", "--format", "{{.Name}}"))) {
  Invoke-Docker @("network", "create", "--internal", "aos-egress") | Out-Null
}
if (-not (Invoke-Docker @("ps", "-a", "--filter", "name=^aos-egress-proxy$", "--format", "{{.Names}}"))) {
  Invoke-Docker @("run", "-d", "--name", "aos-egress-proxy", "--restart", "unless-stopped", "--network", "bridge",
    "-v", "${conf}:/etc/squid/squid.conf:ro", "ubuntu/squid:latest") | Out-Null
  Invoke-Docker @("network", "connect", "aos-egress", "aos-egress-proxy") | Out-Null
}
Write-Output "OK: aos-egress (internal) + aos-egress-proxy siap."
