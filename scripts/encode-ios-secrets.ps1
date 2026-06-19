param(
    [Parameter(Mandatory = $true)]
    [string]$MaterialsRoot
)

$ErrorActionPreference = "Stop"

$P12 = Get-ChildItem -LiteralPath $MaterialsRoot -Recurse -Filter "*.p12" | Select-Object -First 1 -ExpandProperty FullName
$ProfileDir = Join-Path $MaterialsRoot "hellostory"
$Profile = Get-ChildItem -LiteralPath $ProfileDir -Filter "*.mobileprovision" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName

if (-not $P12) { throw "p12 not found under MaterialsRoot" }
if (-not $Profile) { throw "mobileprovision not found under hellostory" }

Write-Host "=== CM_CERTIFICATE ===" -ForegroundColor Cyan
[Convert]::ToBase64String([IO.File]::ReadAllBytes($P12))
Write-Host ""
Write-Host "=== CM_PROVISIONING_PROFILE ===" -ForegroundColor Cyan
[Convert]::ToBase64String([IO.File]::ReadAllBytes($Profile))
Write-Host ""
Write-Host "Set CM_CERTIFICATE_PASSWORD manually in Codemagic."
