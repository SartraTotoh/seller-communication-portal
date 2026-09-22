$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2

$ProjectId = 'seller-communication-portal'
$ProjectNumber = '795035951703'
$ForbiddenProjectId = 'education-portal-506713'
$PortalUrl = 'https://seller-communication-portal.web.app/'
$Release = '4.9.3'
$ReleaseRegex = [regex]::Escape($Release)
$ExpectedHost = 'seller-communication-portal.web.app'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PublicFile = Join-Path $Root 'public\index.html'
$BackendDir = Join-Path $Root 'backend'
$FirebaseRc = Join-Path $Root '.firebaserc'
$FirebaseJson = Join-Path $Root 'firebase.json'
$StateDir = Join-Path $env:LOCALAPPDATA 'SellerCommunicationPortal'
$StateFile = Join-Path $StateDir 'deploy-state.json'
New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
$ToolsDir = Join-Path $Root 'tools'
$FirebaseExe = Join-Path $ToolsDir 'firebase.exe'
$ClaspVersion = '3.3.0'
$ResolverTool = Join-Path $ToolsDir 'resolve-apps-script-owner.mjs'
$DeploymentUpdaterTool = Join-Path $ToolsDir 'update-apps-script-deployment.mjs'
$ValidatorTool = Join-Path $ToolsDir ('validate-v' + $Release + '.mjs')
New-Item -ItemType Directory -Force -Path $ToolsDir | Out-Null

function Stop-Deploy([string]$Message) {
  Write-Host ''
  Write-Host ('STOP: ' + $Message) -ForegroundColor Red
  exit 1
}
function Step([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Has-Command([string]$Name) { return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Ensure-Node {
  if (Has-Command 'node') { return }
  Write-Host '  Node.js is missing. Trying Windows Package Manager...'
  if (-not (Has-Command 'winget')) { Stop-Deploy 'Node.js is missing and winget is not available.' }
  & winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements --silent
  if ($LASTEXITCODE -ne 0) { Stop-Deploy 'Automatic Node.js installation failed.' }
  $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
  $user = [Environment]::GetEnvironmentVariable('Path','User')
  $env:Path = (($machine,$user) -join ';')
  $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
  if (Test-Path $nodeDir) { $env:Path = "$nodeDir;$env:Path" }
  if (-not (Has-Command 'node')) { Stop-Deploy 'Node.js was installed. Close this window and double-click ONE-CLICK-AUTO-DEPLOY.cmd again.' }
}

function Find-FirebaseCli {
  # Avoid the npm-generated firebase.ps1 shim. On Windows PowerShell 5.1 the
  # Firebase progress spinner writes to stderr and can be promoted to a
  # terminating NativeCommandError when the parent script uses Stop mode.
  # Prefer the underlying JavaScript entrypoint or firebase.cmd instead.
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
  $cacheRoots = @(
    (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'),
    (Join-Path $env:APPDATA 'npm-cache\_npx'),
    (Join-Path $env:USERPROFILE 'AppData\Local\npm-cache\_npx')
  ) | Select-Object -Unique
  foreach ($cacheRoot in $cacheRoots) {
    if (-not (Test-Path $cacheRoot)) { continue }
    Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      $p = Join-Path $_.FullName 'node_modules\firebase-tools\lib\bin\firebase.js'
      if (Test-Path $p) { $candidates += Get-Item $p }
    }
  }
  if ($candidates.Count -gt 0) {
    $best = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    return [pscustomobject]@{Kind='node';Path=$best.FullName;Label='direct Firebase CLI JavaScript (PowerShell-shim safe)'}
  }
  $cmd = Get-Command 'firebase.cmd' -ErrorAction SilentlyContinue
  if ($cmd) { return [pscustomobject]@{Kind='command';Path=$cmd.Source;Label='firebase.cmd (PowerShell-shim safe)'} }
  $raw = Get-Command 'firebase' -ErrorAction SilentlyContinue
  if ($raw -and ([string]$raw.Source -notmatch '\.ps1$')) { return [pscustomobject]@{Kind='command';Path=$raw.Source;Label='installed Firebase CLI'} }
  if (Test-Path $FirebaseExe) { return [pscustomobject]@{Kind='exe';Path=$FirebaseExe;Label='local standalone Firebase CLI'} }
  Write-Host '  Downloading the official standalone Firebase CLI once (not npm)...'
  try {
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -UseBasicParsing -Uri 'https://firebase.tools/bin/win/instant/latest' -OutFile $FirebaseExe -TimeoutSec 120
  } catch { Stop-Deploy 'Firebase CLI is not available and the official download is blocked by the network.' }
  if (-not (Test-Path $FirebaseExe) -or (Get-Item $FirebaseExe).Length -lt 1000000) { Stop-Deploy 'Firebase CLI download was incomplete.' }
  return [pscustomobject]@{Kind='exe';Path=$FirebaseExe;Label='downloaded standalone Firebase CLI'}
}

function Invoke-Firebase([object]$Cli,[string[]]$Args,[bool]$AllowFailure=$false) {
  $oldEap = $ErrorActionPreference
  try {
    # Native CLIs legitimately use stderr for progress. Never treat progress
    # output as a PowerShell terminating exception; trust the process exit code.
    $ErrorActionPreference = 'Continue'
    if ($Cli.Kind -eq 'node') { & node $Cli.Path @Args }
    elseif ($Cli.Kind -eq 'command') { & $Cli.Path @Args }
    else { & $Cli.Path @Args }
    $rc = $LASTEXITCODE
  } finally { $ErrorActionPreference = $oldEap }
  if (-not $AllowFailure -and $rc -ne 0) { Stop-Deploy ('Firebase command failed: ' + ($Args -join ' ')) }
  return $rc
}

function Find-ClaspCli {
  # Same shim rule as Firebase: prefer the JS entrypoint / .cmd, never clasp.ps1.
  $candidates = @()
  foreach ($base in @((Join-Path $env:APPDATA 'npm\node_modules'),(Join-Path $env:LOCALAPPDATA 'npm\node_modules'))) {
    foreach ($rel in @('@google\clasp\build\src\index.js','@google\clasp\build\src\cli.js','@google\clasp\src\index.js')) {
      $p = Join-Path $base $rel
      if (Test-Path $p) { $candidates += Get-Item $p }
    }
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
        foreach ($rel in @('@google\clasp\build\src\index.js','@google\clasp\build\src\cli.js','@google\clasp\src\index.js')) {
          $p = Join-Path $npmRoot $rel
          if (Test-Path $p) { $candidates += Get-Item $p }
        }
      }
    }
  } catch {}
  $cacheRoots = @(
    (Join-Path $env:LOCALAPPDATA 'npm-cache\_npx'),
    (Join-Path $env:APPDATA 'npm-cache\_npx'),
    (Join-Path $env:USERPROFILE 'AppData\Local\npm-cache\_npx')
  ) | Select-Object -Unique
  foreach ($cacheRoot in $cacheRoots) {
    if (-not (Test-Path $cacheRoot)) { continue }
    Get-ChildItem -Path $cacheRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      foreach ($rel in @('node_modules\@google\clasp\build\src\index.js','node_modules\@google\clasp\build\src\cli.js')) {
        $p = Join-Path $_.FullName $rel
        if (Test-Path $p) { $candidates += Get-Item $p }
      }
    }
  }
  if ($candidates.Count -gt 0) {
    $best = $candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    return [pscustomobject]@{Kind='node';Path=$best.FullName;Label='direct clasp JavaScript (PowerShell-shim safe)'}
  }
  $cmd = Get-Command 'clasp.cmd' -ErrorAction SilentlyContinue
  if ($cmd) { return [pscustomobject]@{Kind='command';Path=$cmd.Source;Label='clasp.cmd (PowerShell-shim safe)'} }
  return [pscustomobject]@{Kind='npx';Path='';Label='npx clasp bootstrap'}
}

function Invoke-Clasp([object]$Cli,[string[]]$Args,[bool]$AllowFailure=$false) {
  $oldEap = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    if ($Cli.Kind -eq 'node') { & node $Cli.Path @Args }
    elseif ($Cli.Kind -eq 'command') { & $Cli.Path @Args }
    else {
      $npx = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
      if (-not $npx) { Stop-Deploy 'npx.cmd is unavailable for clasp bootstrap.' }
      & $npx.Source --yes "@google/clasp@$ClaspVersion" @Args
    }
    $rc = $LASTEXITCODE
  } finally { $ErrorActionPreference = $oldEap }
  if (-not $AllowFailure -and $rc -ne 0) { Stop-Deploy ('clasp command failed: ' + ($Args -join ' ')) }
  return $rc
}

function Get-CurrentDeploymentId([string]$Html) {
  $m = [regex]::Match($Html,'https://script\.google\.com/a/macros/shopee\.com/s/(?<id>AKfy[A-Za-z0-9_-]+)/exec')
  if ($m.Success) { return $m.Groups['id'].Value }
  return ''
}

function Verify-Package {
  foreach ($p in @($PublicFile,$FirebaseRc,$FirebaseJson,(Join-Path $BackendDir 'appsscript.json'),(Join-Path $BackendDir 'PeopleSeed.gs'),(Join-Path $BackendDir 'Closeout.gs'),$ResolverTool,$DeploymentUpdaterTool,$ValidatorTool)) {
    if (-not (Test-Path $p)) { Stop-Deploy ('Missing required file: ' + $p) }
  }
  $front = Get-Content -Raw -Encoding UTF8 $PublicFile
  if ($front -notmatch 'data-functional-baseline="4\.6\.0"') { Stop-Deploy 'Functional baseline is not 4.6.0.' }
  if ($front -notmatch 'data-ui-version="4\.6\.8"') { Stop-Deploy 'UI version is not 4.6.8.' }
  if ($front -notmatch ('data-portal-version="' + $ReleaseRegex + '"')) { Stop-Deploy ('Portal version is not ' + $Release + '.') }
  if ($front -notmatch 'id="beginner-guidance-v480"') { Stop-Deploy 'Beginner Guidance stylesheet is missing.' }
  if ($front -notmatch 'const BEGINNER_GUIDE_DEFINITIONS=') { Stop-Deploy 'Beginner Guidance definitions are missing.' }
  if ($front -notmatch 'new IntersectionObserver') { Stop-Deploy 'Scroll-trigger Beginner Guidance is missing.' }
  if ($front -notmatch 'id="beginnerGuideToggle"') { Stop-Deploy 'Beginner Guides toggle is missing.' }
  $rc = Get-Content -Raw -Encoding UTF8 $FirebaseRc
  if ($rc -match [regex]::Escape($ForbiddenProjectId)) { Stop-Deploy 'Forbidden Education Portal project detected in .firebaserc.' }
  if ($rc -notmatch '"default"\s*:\s*"seller-communication-portal"') { Stop-Deploy 'Firebase project lock is not seller-communication-portal.' }
  $fj = Get-Content -Raw -Encoding UTF8 $FirebaseJson
  if ($fj -match '"(functions|firestore|storage)"\s*:') { Stop-Deploy 'firebase.json must be Hosting-only. Firestore/Functions/Storage deployment is blocked.' }
  $manifest = Get-Content -Raw -Encoding UTF8 (Join-Path $BackendDir 'appsscript.json')
  if ($manifest -notmatch '"access"\s*:\s*"DOMAIN"') { Stop-Deploy 'Apps Script Web App access must be DOMAIN. ANYONE / ANYONE_ANONYMOUS are blocked by company policy.' }
  if ($manifest -notmatch '"executeAs"\s*:\s*"USER_ACCESSING"') { Stop-Deploy 'Apps Script must execute as USER_ACCESSING so Workspace identity and role checks are enforceable.' }
  $closeout = Get-Content -Raw -Encoding UTF8 (Join-Path $BackendDir 'Closeout.gs')
  $closeoutPattern = 'PORTAL_CLOSEOUT_RELEASE\s*=\s*["'']' + $ReleaseRegex + '["'']'
  if ($closeout -notmatch $closeoutPattern) { Stop-Deploy ('v' + $Release + ' closeout backend is missing or release-mismatched.') }
  $trackerText = Get-Content -Raw -Encoding UTF8 (Join-Path $BackendDir 'TrackerSync.gs')
  $trackerPattern = 'PORTAL_BACKEND_RELEASE\s*=\s*["'']' + $ReleaseRegex + '["'']'
  if ($trackerText -notmatch $trackerPattern) { Stop-Deploy ('Backend release is not ' + $Release + '.') }
  $liveText = Get-Content -Raw -Encoding UTF8 (Join-Path $BackendDir 'LiveSyncEngine.gs')
  $livePattern = "LIVE_SYNC_SETUP_RELEASE', PORTAL_BACKEND_RELEASE"
  if ($liveText -notmatch $livePattern) { Stop-Deploy 'Live Sync setup must derive its release from PORTAL_BACKEND_RELEASE.' }
  if ($liveText -notmatch 'triggeredBy:portalSetupTriggerTag_\(\)') { Stop-Deploy 'Live Sync setup trigger tag is not derived from the backend release.' }
  $snapshot = Join-Path $Root 'public\data\requests-2026.json'
  if (-not (Test-Path $snapshot)) { Stop-Deploy 'Fail-closed public snapshot is missing.' }
  $snapshotText = Get-Content -Raw -Encoding UTF8 $snapshot
  if ($snapshotText -match '@shopee\.com' -or $snapshotText -notmatch '"requestCount"\s*:\s*0') { Stop-Deploy 'Public snapshot contains company data or is not fail-closed.' }
  $seedText = Get-Content -Raw -Encoding UTF8 (Join-Path $BackendDir 'PeopleSeed.gs')
  if ($seedText -notmatch 'PEOPLE_SEED_V474_EXPECTED\s*=\s*503') { Stop-Deploy 'People recovery seed is not the verified 503-identity package.' }
  if ($seedText -notmatch 'sellereducation\.th@shopee\.com') { Stop-Deploy 'Bootstrap admin continuity identity is missing from People seed.' }
  return $front
}

function Verify-FirebaseProject([object]$Cli) {
  $tmp = [IO.Path]::GetTempFileName()
  $err = [IO.Path]::GetTempFileName()
  try {
    $oldEap = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      if ($Cli.Kind -eq 'node') { & node $Cli.Path projects:list --json --non-interactive 1>$tmp 2>$err }
      elseif ($Cli.Kind -eq 'command') { & $Cli.Path projects:list --json --non-interactive 1>$tmp 2>$err }
      else { & $Cli.Path projects:list --json --non-interactive 1>$tmp 2>$err }
      $rc = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldEap }
    if ($rc -ne 0) { return $false }
    $raw = Get-Content -Raw -Encoding UTF8 $tmp
    if ([string]::IsNullOrWhiteSpace($raw)) { return $false }
    $data = $raw | ConvertFrom-Json
    $rows = if ($null -ne $data.result) { @($data.result) } else { @($data) }
    foreach ($p in $rows) {
      if ([string]$p.projectId -eq $ProjectId) {
        if ([string]$p.projectNumber -ne $ProjectNumber) { Stop-Deploy 'Project ID matched but project number did not. Hard stop.' }
        return $true
      }
    }
    return $false
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Remove-Item $err -Force -ErrorAction SilentlyContinue
  }
}

function Get-ClaspListText([object]$Cli) {
  $tmp = [IO.Path]::GetTempFileName()
  $err = [IO.Path]::GetTempFileName()
  try {
    $oldEap = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      if ($Cli.Kind -eq 'node') { & node $Cli.Path list 1>$tmp 2>$err }
      elseif ($Cli.Kind -eq 'command') { & $Cli.Path list 1>$tmp 2>$err }
      else {
        $npx = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
        if (-not $npx) { return $null }
        & $npx.Source --yes "@google/clasp@$ClaspVersion" list 1>$tmp 2>$err
      }
      $rc = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldEap }
    if ($rc -ne 0) { return $null }
    return (Get-Content -Raw -Encoding UTF8 $tmp)
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    Remove-Item $err -Force -ErrorAction SilentlyContinue
  }
}

function Add-Candidate([System.Collections.Generic.List[string]]$List,[string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return }
  if ($Value -like 'AKfy*') { return }
  if (-not $List.Contains($Value)) { $List.Add($Value) | Out-Null }
}

function Candidate-IdsFromText([string]$Text) {
  $list = New-Object 'System.Collections.Generic.List[string]'
  if ([string]::IsNullOrWhiteSpace($Text)) { return $list }
  foreach ($m in [regex]::Matches($Text,'(?<![A-Za-z0-9_-])([A-Za-z0-9_-]{30,})(?![A-Za-z0-9_-])')) {
    Add-Candidate $list $m.Groups[1].Value
  }
  return $list
}

function Candidate-IdsFromDisk {
  $list = New-Object 'System.Collections.Generic.List[string]'
  $roots = @(
    $Root,
    (Join-Path $env:USERPROFILE 'Downloads'),
    (Join-Path $env:USERPROFILE 'Desktop'),
    (Join-Path $env:USERPROFILE 'Documents')
  ) | Select-Object -Unique
  foreach ($r in $roots) {
    if (-not (Test-Path $r)) { continue }
    Get-ChildItem -Path $r -Filter '.clasp.json' -File -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $o = Get-Content -Raw -Encoding UTF8 $_.FullName | ConvertFrom-Json
        Add-Candidate $list ([string]$o.scriptId)
      } catch {}
    }
  }
  return $list
}

function Script-HasDeployment([object]$Clasp,[string]$ScriptId,[string]$DeploymentId) {
  if ([string]::IsNullOrWhiteSpace($ScriptId) -or [string]::IsNullOrWhiteSpace($DeploymentId)) { return $false }
  $td = Join-Path ([IO.Path]::GetTempPath()) ('seller-comms-resolve-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $td | Out-Null
  try {
    @{scriptId=$ScriptId} | ConvertTo-Json -Compress | Set-Content -Encoding UTF8 (Join-Path $td '.clasp.json')
    Push-Location $td
    try {
      $tmp = [IO.Path]::GetTempFileName()
      try {
        $oldEap = $ErrorActionPreference
        try {
          $ErrorActionPreference = 'Continue'
          if ($Clasp.Kind -eq 'node') { & node $Clasp.Path deployments 1>$tmp 2>&1 }
          elseif ($Clasp.Kind -eq 'command') { & $Clasp.Path deployments 1>$tmp 2>&1 }
          else {
            $npx = Get-Command 'npx.cmd' -ErrorAction SilentlyContinue
            if (-not $npx) { return $false }
            & $npx.Source --yes "@google/clasp@$ClaspVersion" deployments 1>$tmp 2>&1
          }
          $rc = $LASTEXITCODE
        } finally { $ErrorActionPreference = $oldEap }
        if ($rc -ne 0) { return $false }
        $text = Get-Content -Raw -ErrorAction SilentlyContinue $tmp
        return ($text -like ('*' + $DeploymentId + '*'))
      } finally { Remove-Item $tmp -Force -ErrorAction SilentlyContinue }
    } finally { Pop-Location }
  } catch { return $false }
  finally { Remove-Item $td -Recurse -Force -ErrorAction SilentlyContinue }
}

function Resolve-ScriptId([object]$Clasp,[string]$DeploymentId,[string]$ListText) {
  $candidates = New-Object 'System.Collections.Generic.List[string]'
  if (Test-Path (Join-Path $BackendDir '.clasp.json')) {
    try { Add-Candidate $candidates ([string]((Get-Content -Raw -Encoding UTF8 (Join-Path $BackendDir '.clasp.json') | ConvertFrom-Json).scriptId)) } catch {}
  }
  if (Test-Path $StateFile) {
    try { Add-Candidate $candidates ([string]((Get-Content -Raw -Encoding UTF8 $StateFile | ConvertFrom-Json).scriptId)) } catch {}
  }
  foreach ($x in (Candidate-IdsFromDisk)) { Add-Candidate $candidates $x }
  foreach ($x in (Candidate-IdsFromText $ListText)) { Add-Candidate $candidates $x }

  if (-not (Test-Path $ResolverTool)) { Stop-Deploy 'Apps Script resolver helper is missing from the package.' }
  $candidateFile = [IO.Path]::GetTempFileName()
  $resolverOut = [IO.Path]::GetTempFileName()
  $resolverErr = [IO.Path]::GetTempFileName()
  try {
    $payload = @{ deploymentId=$DeploymentId; candidates=@($candidates) } | ConvertTo-Json -Depth 4
    [IO.File]::WriteAllText($candidateFile,$payload,(New-Object Text.UTF8Encoding($false)))
    Write-Host ('  Local/clasp candidates: ' + $candidates.Count + '. Expanding with Google Drive All-Drives metadata...')
    $oldEap = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & node $ResolverTool --deployment $DeploymentId --candidates $candidateFile 1>$resolverOut 2>$resolverErr
      $helperRc = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldEap }
    $raw = (Get-Content -Raw -Encoding UTF8 $resolverOut -ErrorAction SilentlyContinue)
    $diag = $null
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
      try { $diag = $raw.Trim() | ConvertFrom-Json } catch {}
    }
    if ($null -ne $diag) {
      if (-not [string]::IsNullOrWhiteSpace([string]$diag.email)) { Write-Host ('  OAuth account: ' + [string]$diag.email) }
      if ($null -ne $diag.driveCandidateCount) { Write-Host ('  Drive Apps Script projects checked: ' + [string]$diag.driveCandidateCount + ' | total candidates: ' + [string]$diag.candidateCount) }
      if (-not [string]::IsNullOrWhiteSpace([string]$diag.driveError)) { Write-Host ('  Drive enumeration note: ' + [string]$diag.driveError) -ForegroundColor Yellow }
      if ($helperRc -eq 0 -and -not [string]::IsNullOrWhiteSpace([string]$diag.scriptId)) {
        if (-not [string]::IsNullOrWhiteSpace([string]$diag.name)) { Write-Host ('  Matched Apps Script: ' + [string]$diag.name) }
        return [string]$diag.scriptId
      }
      if ($helperRc -eq 4) { Stop-Deploy ('The live Apps Script project was found but is read-only for ' + [string]$diag.email + '. Use an account with edit access; no duplicate was created.') }
      if ([string]$diag.error -eq 'MULTIPLE_DEPLOYMENT_OWNERS') { Stop-Deploy 'More than one Apps Script project claims the existing deployment ID. Hard stop.' }
      if ([string]$diag.error -eq 'DEPLOYMENT_OWNER_NOT_VISIBLE') {
        Write-Host '  Direct Google APIs did not find the live deployment owner under this OAuth account.' -ForegroundColor Yellow
      }
    } else {
      $errText = Get-Content -Raw -Encoding UTF8 $resolverErr -ErrorAction SilentlyContinue
      if (-not [string]::IsNullOrWhiteSpace($errText)) { Write-Host ('  Resolver diagnostic: ' + $errText.Trim()) -ForegroundColor Yellow }
    }
  } finally {
    Remove-Item $candidateFile,$resolverOut,$resolverErr -Force -ErrorAction SilentlyContinue
  }

  # Last-chance compatibility probe through clasp for local candidates.
  Write-Host ('  Compatibility probe: checking ' + $candidates.Count + ' local candidate(s) with clasp...')
  $hits = New-Object 'System.Collections.Generic.List[string]'
  foreach ($sid in $candidates) {
    if (Script-HasDeployment $Clasp $sid $DeploymentId) { $hits.Add($sid) | Out-Null }
  }
  if ($hits.Count -eq 1) { return $hits[0] }
  if ($hits.Count -gt 1) { Stop-Deploy 'More than one Apps Script project claims the current deployment ID.' }
  return ''
}

Write-Host ''
Write-Host '=================================================================='
Write-Host (' Seller Communication Portal v' + $Release + ' - TRIPLE SOURCE + CAMPAIGN 360')
Write-Host (' functional 4.6.0 | UI 4.6.8 | Portal ' + $Release + ' | PN + SCA + Social | Campaign 360 | Asset Approval | DOMAIN + USER_ACCESSING')
Write-Host ' HARD LOCK: seller-communication-portal | Hosting-only Firebase'
Write-Host ' BLOCKED TARGET: education-portal-506713'
Write-Host '=================================================================='
Write-Host ''

Step '[1/10] Safety gate...'
Ensure-Node
$front = Verify-Package
Write-Host ('  Running v' + $Release + ' triple-source + Campaign 360 gate...')
& node $ValidatorTool
if ($LASTEXITCODE -ne 0) { Stop-Deploy ('v' + $Release + ' validation failed. Nothing was deployed.') }
Write-Host ('  OK: v' + $Release + ' validation PASS')
$currentDeploymentId = Get-CurrentDeploymentId $front
if ([string]::IsNullOrWhiteSpace($currentDeploymentId)) { Stop-Deploy 'Existing Apps Script /exec deployment ID was not found in the Portal. Refusing to create a new backend.' }
Write-Host ('  OK: existing backend deployment = ' + $currentDeploymentId)
Write-Host ('  OK: target project = ' + $ProjectId + ' / ' + $ProjectNumber)
Write-Host '  OK: Firebase deployment scope = Hosting only'

Step '[2/10] Firebase CLI + account...'
$firebase = Find-FirebaseCli
Write-Host ('  OK: ' + $firebase.Label)
if (-not (Verify-FirebaseProject $firebase)) {
  Write-Host '  Opening Firebase browser sign-in. Approve once; no URL copy/paste is required.'
  Invoke-Firebase $firebase @('login','--reauth') | Out-Null
  if (-not (Verify-FirebaseProject $firebase)) { Stop-Deploy 'Authorized Firebase account cannot see the locked Seller Communication Portal project.' }
}
Invoke-Firebase $firebase @('use',$ProjectId) | Out-Null

Step '[3/10] Apps Script CLI + account...'
$clasp = Find-ClaspCli
Write-Host ('  Using: ' + $clasp.Label)
$listText = Get-ClaspListText $clasp
if ($null -eq $listText) {
  Write-Host '  Opening Google Apps Script browser sign-in. Approve once; localhost callback returns automatically.'
  Invoke-Clasp $clasp @('login') | Out-Null
  $listText = Get-ClaspListText $clasp
  if ($null -eq $listText) { Stop-Deploy 'Apps Script authorization did not become ready.' }
}

Step '[4/10] Resolving existing /exec owner via Drive + Apps Script APIs...'
$scriptId = Resolve-ScriptId $clasp $currentDeploymentId $listText
if ([string]::IsNullOrWhiteSpace($scriptId)) { Stop-Deploy 'The authorized account cannot resolve the Apps Script project that owns the existing /exec URL. No duplicate was created.' }
Write-Host ('  OK: Script ID resolved = ' + $scriptId)
[IO.File]::WriteAllText((Join-Path $BackendDir '.clasp.json'),(@{scriptId=$scriptId} | ConvertTo-Json -Compress),(New-Object Text.UTF8Encoding($false)))
[IO.File]::WriteAllText($StateFile,(@{scriptId=$scriptId;deploymentId=$currentDeploymentId;projectId=$ProjectId;updatedAt=(Get-Date).ToString('o')} | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))

Step '[5/10] Verifying deployment ownership before source backup...'
Push-Location $BackendDir
try {
  # Source update is performed by the API updater after backup and collision migration.
  # Deployment owner is verified by the direct Apps Script API updater.

  Step '[6/10] Self-healing remote DOMAIN policy, creating version, and updating Apps Script Web App...'
  if (-not (Test-Path $DeploymentUpdaterTool)) { Stop-Deploy 'Direct Apps Script deployment updater is missing.' }
  $updateOut = [IO.Path]::GetTempFileName()
  try {
    $oldEap = $ErrorActionPreference
    try {
      $ErrorActionPreference = 'Continue'
      & node $DeploymentUpdaterTool --script $scriptId --deployment $currentDeploymentId --description ('Seller Communication Portal v' + $Release + ' Triple Source Campaign 360') --required-access 'DOMAIN' --required-execute-as 'USER_ACCESSING' --required-release $Release --backend-dir $BackendDir 1>$updateOut 2>&1
      $updateRc = $LASTEXITCODE
    } finally { $ErrorActionPreference = $oldEap }
    $updateText = Get-Content -Raw -Encoding UTF8 $updateOut -ErrorAction SilentlyContinue
    if ($updateRc -ne 0) { Stop-Deploy ('Apps Script API deployment update failed: ' + $updateText.Trim()) }
    try { $updateDiag = $updateText.Trim() | ConvertFrom-Json } catch { Stop-Deploy ('Apps Script API returned an unreadable response: ' + $updateText.Trim()) }
    if (-not $updateDiag.ok -or [string]::IsNullOrWhiteSpace([string]$updateDiag.deploymentId)) { Stop-Deploy 'Apps Script deployment verification failed after update.' }
    if ([string]$updateDiag.access -ne 'DOMAIN' -or [string]$updateDiag.executeAs -ne 'USER_ACCESSING') { Stop-Deploy 'Apps Script deployment is not DOMAIN + USER_ACCESSING after verification.' }
    if (-not [bool]$updateDiag.sourceAttested -or [string]$updateDiag.attestedRelease -ne $Release) { Stop-Deploy ('Immutable Apps Script source attestation did not prove backend release ' + $Release + '. Setup was not opened.') }
    if ([string]$updateDiag.manifestSelfHeal -eq 'updated_remote_source_and_manifest') {
      Write-Host '  REMOTE SOURCE SELF-HEAL: package backend source + DOMAIN manifest were overlaid onto Google HEAD and verified by read-back.' -ForegroundColor Yellow
    } elseif ([string]$updateDiag.manifestSelfHeal -eq 'updated_remote_source') {
      Write-Host '  REMOTE SOURCE SELF-HEAL: stale Google backend source was replaced from this package and verified by read-back.' -ForegroundColor Yellow
    } elseif ([string]$updateDiag.manifestSelfHeal -eq 'updated_remote_manifest') {
      Write-Host '  REMOTE MANIFEST SELF-HEAL: Google HEAD was patched to DOMAIN + USER_ACCESSING and verified by read-back.' -ForegroundColor Yellow
    } elseif ([string]$updateDiag.manifestSelfHeal -eq 'already_ready') {
      Write-Host '  OK: remote Apps Script source and manifest already match this release.' -ForegroundColor Green
    }
    Write-Host ('  OK: immutable Apps Script source attested as backend release ' + [string]$updateDiag.attestedRelease + '.') -ForegroundColor Green

    $resolvedDeploymentId = [string]$updateDiag.deploymentId
    if ($resolvedDeploymentId -ne $currentDeploymentId) {
      $previousDeploymentId = $currentDeploymentId
      if ([string]$updateDiag.mode -ne 'created_domain_replacement') { Stop-Deploy 'Apps Script deployment ID changed without the approved domain-policy replacement mode.' }
      Write-Host '  DOMAIN POLICY MIGRATION: the legacy deployment could not be updated because it was created with ANYONE access.' -ForegroundColor Yellow
      Write-Host ('  Old deployment kept for rollback: ' + $previousDeploymentId) -ForegroundColor Yellow
      Write-Host ('  New DOMAIN deployment:            ' + $resolvedDeploymentId) -ForegroundColor Green

      $frontNow = Get-Content -Raw -Encoding UTF8 $PublicFile
      if ($frontNow -notmatch [regex]::Escape($previousDeploymentId)) { Stop-Deploy 'Could not locate the previous backend ID in public\index.html for safe migration.' }
      $frontNow = $frontNow.Replace($previousDeploymentId,$resolvedDeploymentId)
      [IO.File]::WriteAllText($PublicFile,$frontNow,(New-Object Text.UTF8Encoding($false)))
      $frontVerify = Get-Content -Raw -Encoding UTF8 $PublicFile
      if ($frontVerify -notmatch [regex]::Escape($resolvedDeploymentId) -or $frontVerify -match [regex]::Escape($previousDeploymentId)) { Stop-Deploy 'Frontend backend migration verification failed. Firebase was not deployed.' }
      $currentDeploymentId = $resolvedDeploymentId
      [IO.File]::WriteAllText($StateFile,(@{scriptId=$scriptId;deploymentId=$currentDeploymentId;previousDeploymentId=$previousDeploymentId;projectId=$ProjectId;updatedAt=(Get-Date).ToString('o');migration='DOMAIN_POLICY_REPLACEMENT'} | ConvertTo-Json),(New-Object Text.UTF8Encoding($false)))
      Write-Host '  OK: Firebase frontend was rebound to the verified DOMAIN-only Apps Script deployment.' -ForegroundColor Green
    } else {
      Write-Host ('  OK: existing deployment updated in place to immutable Apps Script version ' + [string]$updateDiag.versionNumber + '.') -ForegroundColor Green
    }
  } finally { Remove-Item $updateOut -Force -ErrorAction SilentlyContinue }
} finally { Pop-Location }

Step '[7/10] Initializing People + PN + SCA + Social Live Sync automatically...'
$BackendUrl = 'https://script.google.com/a/macros/shopee.com/s/' + $currentDeploymentId + '/exec'
$SetupUrl = $BackendUrl + '?action=setup&release=' + $Release + '&ts=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
Write-Host '  Opening the source-attested Apps Script deployment setup in your browser.'
Write-Host '  This setup self-heals People, reconciles PN + SCA + Social Media, and refuses READY unless all three source checkpoints pass.'
Write-Host '  If Google asks for a company sign-in/permission, approve it once. No Terminal input is required.'
Start-Process $SetupUrl
Start-Sleep -Seconds 10
Write-Host ('  Live recovery setup launched. The page MUST visibly show Backend release: v' + $Release + ' before any result is trusted.')

Step '[8/10] Deploying Firebase Hosting to seller-communication-portal ONLY...'
# Re-check package locks immediately before the write.
$rc = Get-Content -Raw -Encoding UTF8 $FirebaseRc
if ($rc -match [regex]::Escape($ForbiddenProjectId)) { Stop-Deploy 'Education Portal target appeared before deploy. Hard stop.' }
if ($rc -notmatch '"default"\s*:\s*"seller-communication-portal"') { Stop-Deploy 'Firebase project lock changed before deploy.' }
Push-Location $Root
try { Invoke-Firebase $firebase @('deploy','--project',$ProjectId,'--only','hosting','--non-interactive') | Out-Null }
finally { Pop-Location }

Step '[9/10] Verifying Production Hosting...'
$verified = $false
for ($i=1; $i -le 5; $i++) {
  try {
    Start-Sleep -Seconds 3
    $u = $PortalUrl + '?verify=' + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $r = Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 30 -Headers @{'Cache-Control'='no-cache'}
    if ([string]$r.Content -match ('data-portal-version="' + $ReleaseRegex + '"') -and [string]$r.Content -match 'data-functional-baseline="4\.6\.0"') { $verified = $true; break }
  } catch {}
}
if ($verified) { Write-Host ('  OK: Production serves Portal v' + $Release + '.') -ForegroundColor Green }
else { Stop-Deploy ('Firebase Hosting deploy returned but Production v' + $Release + ' could not be verified. Portal was not marked complete.') }
Step '[10/10] Opening Production portal...'
Start-Process ($PortalUrl + '?release=' + $Release + '#settings')
Write-Host ''
Write-Host '=================================================================='
Write-Host ' AUTO DEPLOY COMPLETE - SELLER COMMUNICATION PORTAL'
Write-Host (' Portal:  ' + $PortalUrl)
Write-Host (' Project: ' + $ProjectId + ' / ' + $ProjectNumber)
Write-Host (' Backend deployment preserved: ' + $currentDeploymentId)
Write-Host ' Firebase scope: Hosting only'
Write-Host (' Live Sync setup: browser launched at ' + $BackendUrl + '?action=setup')
Write-Host ' Education Portal: NOT TARGETED by this package'
Write-Host '=================================================================='
exit 0
