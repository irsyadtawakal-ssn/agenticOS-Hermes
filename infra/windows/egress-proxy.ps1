# Membuat network internal aos-egress + proxy allowlist (Squid) untuk sandbox dev. Idempoten.
$ErrorActionPreference = "Stop"
$conf = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\docker\egress\squid.conf"))
docker network inspect aos-egress *> $null
if ($LASTEXITCODE -ne 0) { docker network create --internal aos-egress | Out-Null }
docker inspect aos-egress-proxy *> $null
if ($LASTEXITCODE -ne 0) {
  docker run -d --name aos-egress-proxy --restart unless-stopped --network bridge -v "${conf}:/etc/squid/squid.conf:ro" ubuntu/squid:latest | Out-Null
  docker network connect aos-egress aos-egress-proxy
}
Write-Output "OK: aos-egress (internal) + aos-egress-proxy siap."
