$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$ProjectId = 'seller-communication-portal'
$ForbiddenProjectId = 'education-portal-506713'
$Release = '4.9.3'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$PublicFile = Join-Path $Root 'public\index.html'
$FirebaseRc = Join-Path $Root '.firebaserc'
$FirebaseJson = Join-Path $Root 'firebase.json'
$ReportDir = Join-Path $Root 'RECOVERY_REPORT'
$LogFile = Join-Path $ReportDir 'HOSTING-VERIFY-R1.log'
$FirebaseExe = Join-Path (Join-Path $Root 'tools') 'firebase.exe'
$Origins = @(
  'https://seller-communication-portal.web.app/',
  'https://seller-communication-portal.firebaseapp.com/'
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
function Has-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Assert-LocalLocks {
  if (-not (Test-Path $PublicFile)) { Stop-Recovery ('Missing file: ' + $PublicFile) }
  if (-not (Test-Path $FirebaseRc)) { Stop-Recovery ('Missing file: ' + $FirebaseRc) }
  if (-not (Test-Path $FirebaseJson)) { Stop-Recovery ('Missing file: ' + $FirebaseJson) }

  $front = Get-Content -Raw -Encoding UTF8 $PublicFile
  if ($front -notmatch 'data-portal-version="4\.9\.3"') { Stop-Recovery 'Local public/index.html is not Portal v4.9.3.' }
  if ($front -notmatch 'data-functional-baseline="4\.6\.0"') { Stop-Recovery 'Local functional baseline is not 4.6.0.' }

  $rc = Get-Content -Raw -Encoding UTF8 $FirebaseRc
  if ($rc -notmatch '"default"\s*:\s*"seller-communication-portal"') { Stop-Recovery 'Firebase target lock is not seller-communication-portal.' }
  if ($rc -match [regex]::Escape($ForbiddenProjectId)) { Stop-Recovery 'Forbidden Education Portal target was found. No deployment was attempted.' }

  $fj = Get-Content -Raw -Encoding UTF8 $FirebaseJson
  if ($fj -notmatch '"public"\s*:\s*"public"') { Stop-Recovery 'firebase.json does not point Hosting at public.' }
}

function Find-FirebaseCli {
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
    return [pscustomobject]@{Kind='node';Path=$best.FullName;Label='direct Firebase CLI JavaScript'}
  }
  $cmd = Get-Command 'firebase.cmd' -ErrorAction SilentlyContinue
  if ($cmd) { return [pscustomobject]@{Kind='command';Path=$cmd.Source;Label='firebase.cmd'} }
  $raw = Get-Command 'firebase' -ErrorAction SilentlyContinue
  if ($raw -and ([string]$raw.Source -notmatch '\.ps1$')) { return [pscustomobject]@{Kind='command';Path=$raw.Source;Label='installed Firebase CLI'} }
  if (Test-Path $FirebaseExe) { return [pscustomobject]@{Kind='exe';Path=$FirebaseExe;Label='local standalone Firebase CLI'} }
  Stop-Recovery 'Firebase CLI was not found. The recovery did not modify Hosting or backend data.'
}

function Invoke-Firebase([object]$Cli,[string[]]$Args) {
  $oldEap = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($Cli.Kind -eq 'node') { & node $Cli.Path @Args }
    else { & $Cli.Path @Args }
    $rc = $LASTEXITCODE
  } finally { $ErrorActionPreference = $oldEap }
  if ($rc -ne 0) { Stop-Recovery ('Firebase command failed: ' + ($Args -join ' ')) }
}

function Read-Live([string]$Base,[int]$Attempt) {
  $stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $url = $Base + '?v493r1=' + $stamp + '&attempt=' + $Attempt
  $headers = @{
    'Cache-Control' = 'no-cache, no-store, max-age=0'
    'Pragma' = 'no-cache'
    'Accept' = 'text/html,application/xhtml+xml'
  }

  try {
    $oldProgress = $ProgressPreference
    $ProgressPreference = 'SilentlyContinue'
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 20 -Headers $headers
    } finally { $ProgressPreference = $oldProgress }
    $text = [string]$r.Content
    if (-not [string]::IsNullOrWhiteSpace($text)) {
      return [pscustomobject]@{Ok=$true;Client='Invoke-WebRequest';Url=$url;Status=[int]$r.StatusCode;Content=$text}
    }
  } catch {
    Write-Host ('    IWR: ' + $_.Exception.Message) -ForegroundColor DarkGray
  }

  $curl = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
  if ($curl) {
    try {
      $tmp = [IO.Path]::GetTempFileName()
      $oldEap = $ErrorActionPreference
      try {
        $ErrorActionPreference = 'Continue'
        & $curl.Source '-L' '--fail' '--silent' '--show-error' '--max-time' '20' '-H' 'Cache-Control: no-cache, no-store, max-age=0' '-H' 'Pragma: no-cache' '-o' $tmp $url
        $rc = $LASTEXITCODE
      } finally { $ErrorActionPreference = $oldEap }
      if ($rc -eq 0 -and (Test-Path $tmp)) {
        $text = Get-Content -Raw -Encoding UTF8 $tmp -ErrorAction SilentlyContinue
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        if (-not [string]::IsNullOrWhiteSpace([string]$text)) {
          return [pscustomobject]@{Ok=$true;Client='curl.exe';Url=$url;Status=200;Content=[string]$text}
        }
      } else { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    } catch {
      Write-Host ('    curl: ' + $_.Exception.Message) -ForegroundColor DarkGray
    }
  }
  return [pscustomobject]@{Ok=$false;Client='none';Url=$url;Status=0;Content=''}
}

function Test-LiveVersion([int]$Attempt) {
  foreach ($origin in $Origins) {
    Write-Host ('  Checking ' + $origin + ' ...')
    $snap = Read-Live $origin $Attempt
    if (-not $snap.Ok) {
      Write-Host '    No readable HTML response.' -ForegroundColor Yellow
      continue
    }
    $content = [string]$snap.Content
    $version = ''
    $m = [regex]::Match($content,'data-portal-version="([^"]+)"')
    if ($m.Success) { $version = $m.Groups[1].Value }
    if ($content -match 'data-portal-version="4\.9\.3"' -and $content -match 'data-functional-baseline="4\.6\.0"') {
      Write-Host ('    VERIFIED via ' + $snap.Client + ': Portal v4.9.3 / baseline 4.6.0') -ForegroundColor Green
      return $true
    }
    if ($version) { Write-Host ('    Responded, but serves Portal v' + $version + '.') -ForegroundColor Yellow }
    else { Write-Host '    Responded, but release marker was not found.' -ForegroundColor Yellow }
  }
  return $false
}

function Wait-ForProduction([string]$Phase,[int]$Attempts,[int]$DelaySeconds) {
  Step $Phase
  for ($i=1; $i -le $Attempts; $i++) {
    Write-Host ('  Attempt ' + $i + '/' + $Attempts)
    if (Test-LiveVersion $i) { return $true }
    if ($i -lt $Attempts) { Start-Sleep -Seconds $DelaySeconds }
  }
  return $false
}

Write-Host '=================================================================='
Write-Host ' Seller Communication Portal v4.9.3R1 - Hosting Verify Resume'
Write-Host ' DATA SAFE: no Apps Script update, no Sheets write, no link repair'
Write-Host '=================================================================='

Step '[1/4] Verifying local release + hard project locks...'
Assert-LocalLocks
Write-Host '  OK: local v4.9.3 and seller-communication-portal Hosting-only target are locked.' -ForegroundColor Green

# First give Firebase CDN / corporate network propagation time. This path writes nothing.
if (Wait-ForProduction '[2/4] Read-only production verification before any redeploy...' 12 5) {
  Step '[4/4] Recovery complete - no redeploy was needed.'
  Start-Process 'https://seller-communication-portal.web.app/?release=4.9.3#links'
  Write-Host '  Existing Smart Link data was not touched.' -ForegroundColor Green
  Write-Host ('  Report: ' + $LogFile)
  Finish 0
}

Step '[3/4] Production still not visible. Redeploying Firebase Hosting ONLY...'
$firebase = Find-FirebaseCli
Write-Host ('  Using: ' + $firebase.Label)
Push-Location $Root
try {
  Invoke-Firebase $firebase @('deploy','--project',$ProjectId,'--only','hosting','--non-interactive')
} finally { Pop-Location }
Write-Host '  Firebase Hosting command returned success. Backend and Sheets were not touched.' -ForegroundColor Green

if (-not (Wait-ForProduction '[4/4] Verifying both Firebase production origins after Hosting deploy...' 18 5)) {
  Stop-Recovery 'Hosting deploy succeeded, but neither Firebase origin exposed v4.9.3 within the verification window. This is now isolated to Hosting/CDN/network visibility; no Smart Link data was changed.'
}

Start-Process 'https://seller-communication-portal.web.app/?release=4.9.3#links'
Write-Host ''
Write-Host '=================================================================='
Write-Host ' RECOVERY COMPLETE - PRODUCTION v4.9.3 VERIFIED' -ForegroundColor Green
Write-Host ' Backend: unchanged'
Write-Host ' Google Sheets / Smart Link records: unchanged'
Write-Host ' Firebase: Hosting only'
Write-Host (' Report: ' + $LogFile)
Write-Host '=================================================================='
Finish 0
