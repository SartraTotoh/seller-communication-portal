$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$ProjectId = 'seller-communication-portal'
$ForbiddenProjectId = 'education-portal-506713'
$Release = '4.9.3'
$RecoveryMarker = 'R3-explicit-firebase-deploy'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PublicFile = Join-Path $Root 'public\index.html'
$MarkerFile = Join-Path $Root 'public\release-v4.9.3.json'
$FirebaseRc = Join-Path $Root '.firebaserc'
$FirebaseJson = Join-Path $Root 'firebase.json'
$ReportDir = Join-Path $Root 'RECOVERY_REPORT_R3'
$LogFile = Join-Path $ReportDir 'HOSTING-VERIFY-R3.log'
$MarkerOrigins = @(
  'https://seller-communication-portal.web.app/release-v4.9.3.json',
  'https://seller-communication-portal.firebaseapp.com/release-v4.9.3.json'
)

New-Item -ItemType Directory -Force -Path $ReportDir | Out-Null
try { Start-Transcript -Path $LogFile -Force | Out-Null } catch {}

function Finish([int]$Code) {
  try { Stop-Transcript | Out-Null } catch {}
  exit $Code
}
function Stop-Recovery([string]$Message) {
  Write-Host ''
  Write-Host ('STOP: ' + $Message) -ForegroundColor Red
  Write-Host ('Report: ' + $LogFile) -ForegroundColor Yellow
  Finish 1
}
function Step([string]$Message) { Write-Host $Message -ForegroundColor Cyan }

function Assert-LocalLocks {
  foreach ($p in @($PublicFile,$MarkerFile,$FirebaseRc,$FirebaseJson)) {
    if (-not (Test-Path $p)) { Stop-Recovery ('Missing file: ' + $p) }
  }

  $front = Get-Content -Raw -Encoding UTF8 $PublicFile
  if ($front -notmatch 'data-portal-version="4\.9\.3"') { Stop-Recovery 'Local public/index.html is not Portal v4.9.3.' }
  if ($front -notmatch 'data-functional-baseline="4\.6\.0"') { Stop-Recovery 'Local functional baseline is not 4.6.0.' }

  $marker = Get-Content -Raw -Encoding UTF8 $MarkerFile
  if ($marker -notmatch '"release"\s*:\s*"4\.9\.3"') { Stop-Recovery 'Local release marker is not v4.9.3.' }
  if ($marker -notmatch '"recovery"\s*:\s*"R3-explicit-firebase-deploy"') { Stop-Recovery 'Local R3 release marker is missing.' }
  if ($marker -notmatch '"dataMutation"\s*:\s*false') { Stop-Recovery 'Local release marker does not assert dataMutation=false.' }

  $rc = Get-Content -Raw -Encoding UTF8 $FirebaseRc
  if ($rc -notmatch '"default"\s*:\s*"seller-communication-portal"') { Stop-Recovery 'Firebase target lock is not seller-communication-portal.' }
  if ($rc -match [regex]::Escape($ForbiddenProjectId)) { Stop-Recovery 'Forbidden Education Portal target was found. No deployment was attempted.' }

  $fj = Get-Content -Raw -Encoding UTF8 $FirebaseJson
  if ($fj -notmatch '"public"\s*:\s*"public"') { Stop-Recovery 'firebase.json does not point Hosting at public.' }
  if ($fj -match '"(functions|firestore|storage)"\s*:') { Stop-Recovery 'firebase.json is not Hosting-only.' }
}

function Find-FirebaseCli {
  # Prefer firebase.cmd. This bypasses the PowerShell .ps1 shim and preserves CLI argv.
  $cmd = Get-Command 'firebase.cmd' -ErrorAction SilentlyContinue
  if ($cmd) { return [pscustomobject]@{Kind='command';Path=$cmd.Source;Label='firebase.cmd (explicit argv)'} }

  $raw = Get-Command 'firebase.exe' -ErrorAction SilentlyContinue
  if ($raw) { return [pscustomobject]@{Kind='command';Path=$raw.Source;Label='firebase.exe (explicit argv)'} }

  $candidates = @()
  foreach ($p in @(
    (Join-Path $env:APPDATA 'npm\node_modules\firebase-tools\lib\bin\firebase.js'),
    (Join-Path $env:LOCALAPPDATA 'npm\node_modules\firebase-tools\lib\bin\firebase.js')
  )) {
    if (Test-Path $p) { $candidates += Get-Item $p }
  }
  try {
    $npmCmd = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($npmCmd) {
      $oldEap = $ErrorActionPreference
      try {
        $ErrorActionPreference = 'Continue'
        $npmRoot = (& $npmCmd.Source root -g 2>$null | Out-String).Trim()
      } finally { $ErrorActionPreference = $oldEap }
      if ($npmRoot) {
        $p = Join-Path $npmRoot 'firebase-tools\lib\bin\firebase.js'
        if (Test-Path $p) { $candidates += Get-Item $p }
      }
    }
  } catch {}
  if ($candidates.Count -gt 0) {
    $best = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    return [pscustomobject]@{Kind='node';Path=$best.FullName;Label='direct Firebase CLI JavaScript (explicit argv)'}
  }
  Stop-Recovery 'Firebase CLI was not found. Nothing was changed.'
}

function Invoke-FirebaseHostingDeploy([object]$Cli) {
  Write-Host ('  CLI: ' + $Cli.Label)
  Write-Host ('  Target: ' + $ProjectId + ' | only: hosting')
  Write-Host '  Command argv: deploy --project seller-communication-portal --only hosting --non-interactive'

  $oldEap = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($Cli.Kind -eq 'node') {
      $output = (& node $Cli.Path 'deploy' '--project' $ProjectId '--only' 'hosting' '--non-interactive' 2>&1 | Out-String)
    } else {
      $output = (& $Cli.Path 'deploy' '--project' $ProjectId '--only' 'hosting' '--non-interactive' 2>&1 | Out-String)
    }
    $exitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $oldEap }

  if ($output) { Write-Host $output.TrimEnd() }
  if ($exitCode -ne 0) { Stop-Recovery ('Firebase Hosting deploy failed with exit code ' + $exitCode + '.') }

  # R2 exposed a false-positive where general Firebase help returned exit 0.
  # Reject that explicitly instead of treating it as a successful deploy.
  if ($output -match '(?im)^Usage:\s+firebase' -or $output -match '(?im)^\s*apphosting\s+manage App Hosting resources') {
    Stop-Recovery 'Firebase returned CLI help instead of executing deploy. No backend or Sheets data was touched.'
  }

  Write-Host '  Firebase process returned exit code 0 without the R2 help-screen signature.' -ForegroundColor Green
}

function Invoke-CurlBounded([string]$Url) {
  $curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
  if (-not $curl) { return [pscustomobject]@{Ok=$false;Status=0;Content='';Reason='curl.exe not found'} }
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $joiner = if ($Url.Contains('?')) { '&' } else { '?' }
    $probe = $Url + $joiner + 'r3=' + $stamp
    $oldEap = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      $status = (& $curl.Source '-L' '--silent' '--show-error' '--connect-timeout' '4' '--max-time' '8' '--retry' '0' '-H' 'Cache-Control: no-cache, no-store, max-age=0' '-H' 'Pragma: no-cache' '-o' $tmp '-w' '%{http_code}' $probe 2>&1 | Out-String).Trim()
      $rc = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldEap }
    $content = if (Test-Path $tmp) { [string](Get-Content -Raw -Encoding UTF8 $tmp -ErrorAction SilentlyContinue) } else { '' }
    $http = 0
    if ($status -match '(\d{3})$') { $http = [int]$Matches[1] }
    return [pscustomobject]@{Ok=($rc -eq 0 -and $http -ge 200 -and $http -lt 400);Status=$http;Content=$content;Reason=('curl exit=' + $rc + '; raw=' + $status)}
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

function Test-RemoteMarker {
  foreach ($url in $MarkerOrigins) {
    Write-Host ('  Checking ' + $url + ' ...')
    $snap = Invoke-CurlBounded $url
    if (-not $snap.Ok) {
      Write-Host ('    Not verified (HTTP ' + $snap.Status + ').') -ForegroundColor Yellow
      continue
    }
    $content = [string]$snap.Content
    if ($content -match '"portal"\s*:\s*"seller-communication-portal"' -and
        $content -match '"release"\s*:\s*"4\.9\.3"' -and
        $content -match '"recovery"\s*:\s*"R3-explicit-firebase-deploy"' -and
        $content -match '"dataMutation"\s*:\s*false') {
      Write-Host '    VERIFIED exact v4.9.3 R3 static marker.' -ForegroundColor Green
      return $true
    }
    Write-Host '    HTTP responded, but the exact R3 marker is not live yet.' -ForegroundColor Yellow
  }
  return $false
}

function Wait-Marker([string]$Phase,[int]$Attempts,[int]$DelaySeconds) {
  Step $Phase
  for ($i=1; $i -le $Attempts; $i++) {
    Write-Host ('  Attempt ' + $i + '/' + $Attempts)
    if (Test-RemoteMarker) { return $true }
    if ($i -lt $Attempts) { Start-Sleep -Seconds $DelaySeconds }
  }
  return $false
}

Write-Host '=================================================================='
Write-Host ' Seller Communication Portal v4.9.3R3 - Explicit Hosting Deploy'
Write-Host ' DATA SAFE: Hosting-only; no Apps Script update; no Sheets write'
Write-Host ' Fix: Firebase deploy argv is explicit; CLI help can no longer pass as success.'
Write-Host '=================================================================='

Step '[1/4] Verifying local release + hard project locks...'
Assert-LocalLocks
Write-Host '  OK: v4.9.3 source, R3 marker, and seller-communication-portal target are locked.' -ForegroundColor Green

if (Wait-Marker '[2/4] Fast read-only check for the exact R3 static marker...' 1 1) {
  Step '[4/4] Exact R3 production marker already live - no deploy needed.'
  Write-Host '  Existing Smart Link data was not touched.' -ForegroundColor Green
  Start-Process 'https://seller-communication-portal.web.app/?release=4.9.3-r3#links'
  Finish 0
}

Step '[3/4] Executing Firebase Hosting deploy with explicit CLI arguments...'
$firebase = Find-FirebaseCli
Push-Location $Root
try {
  Invoke-FirebaseHostingDeploy $firebase
} finally { Pop-Location }
Write-Host '  Hosting command completed. Backend and Sheets were not touched.' -ForegroundColor Green

if (-not (Wait-Marker '[4/4] Verifying exact v4.9.3 R3 static marker after deploy...' 6 3)) {
  Stop-Recovery 'Hosting command completed, but the exact R3 static marker could not be read. Stopped without touching Apps Script, Sheets, or Smart Link records.'
}

Write-Host ''
Write-Host '=================================================================='
Write-Host ' RECOVERY COMPLETE - PRODUCTION v4.9.3 R3 VERIFIED' -ForegroundColor Green
Write-Host ' Verification: exact release-v4.9.3.json R3 marker'
Write-Host ' Backend: unchanged'
Write-Host ' Google Sheets / Smart Link records: unchanged'
Write-Host ' Firebase: Hosting only'
Write-Host (' Report: ' + $LogFile)
Write-Host '=================================================================='
Start-Process 'https://seller-communication-portal.web.app/?release=4.9.3-r3#links'
Finish 0
