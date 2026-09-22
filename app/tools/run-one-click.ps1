$ErrorActionPreference = 'Stop'
$AppRoot = Split-Path -Parent $PSScriptRoot
$PackageRoot = Split-Path -Parent $AppRoot
$ReportDir = Join-Path $AppRoot 'RECOVERY_REPORT'
$ReportZip = Join-Path $PackageRoot 'RECOVERY_REPORT.zip'
$RunCode = 1
New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
try {
  Start-Transcript -Path (Join-Path $ReportDir 'LAST_RUN.log') -Force | Out-Null
  & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $AppRoot 'AUTO-DEPLOY.ps1')
  $RunCode = $LASTEXITCODE
} catch {
  Write-Host ('Installation stopped: ' + $_.Exception.Message) -ForegroundColor Red
} finally {
  try { Stop-Transcript | Out-Null } catch {}
}
if ($RunCode -ne 0) {
  try {
    Compress-Archive -Path (Join-Path $ReportDir '*') -DestinationPath $ReportZip -Force
    Write-Host 'The report has been collected automatically and selected for you.' -ForegroundColor Yellow
    Start-Process explorer.exe -ArgumentList ('/select,"' + $ReportZip + '"')
  } catch { Write-Host ('Report location: ' + $ReportDir) }
}
exit $RunCode
