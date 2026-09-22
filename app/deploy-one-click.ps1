$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host 'Seller Communication Portal v4.8.0 uses the policy-safe AUTO-DEPLOY.ps1 flow.' -ForegroundColor Cyan
& powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root 'AUTO-DEPLOY.ps1')
exit $LASTEXITCODE
