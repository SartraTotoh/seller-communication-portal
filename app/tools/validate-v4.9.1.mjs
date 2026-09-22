import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const checks=[]; const pass=(name,ok,detail='')=>{checks.push({name,ok,detail}); if(!ok) process.exitCode=1;};
const front=read('public/index.html'), api=read('backend/PortalApi.gs'), closeout=read('backend/Closeout.gs'), tracker=read('backend/TrackerSync.gs'), live=read('backend/LiveSyncEngine.gs'), manifest=JSON.parse(read('backend/appsscript.json')), firebaserc=JSON.parse(read('.firebaserc')), firebase=JSON.parse(read('firebase.json')), deploy=read('AUTO-DEPLOY.ps1'), snapshot=read('public/data/requests-2026.json'), updater=read('tools/update-apps-script-deployment.mjs');

pass('Portal version 4.9.1',/data-portal-version="4\.9\.1"/.test(front));
pass('Functional baseline 4.6.0 preserved',/data-functional-baseline="4\.6\.0"/.test(front));
pass('UI baseline 4.6.8 preserved',/data-ui-version="4\.6\.8"/.test(front));
pass('Backend closeout release 4.9.1',/PORTAL_CLOSEOUT_RELEASE\s*=\s*['"]4\.9\.1['"]/.test(closeout));
pass('Backend release 4.9.1',/PORTAL_BACKEND_RELEASE\s*=\s*['"]4\.9\.1['"]/.test(tracker));
pass('Live Sync setup release derives from backend release',/LIVE_SYNC_SETUP_RELEASE', PORTAL_BACKEND_RELEASE/.test(live) && /release:PORTAL_BACKEND_RELEASE/.test(live));
pass('Apps Script executes as user accessing',manifest.webapp?.executeAs==='USER_ACCESSING');
pass('Apps Script domain access',manifest.webapp?.access==='DOMAIN');
pass('Firebase target hard-locked',firebaserc.projects?.default==='seller-communication-portal');
pass('Firebase Hosting-only',!!firebase.hosting && !firebase.functions && !firebase.firestore && !firebase.storage);
pass('Deploy blocks THSP project',/ForbiddenProjectId\s*=\s*['"]education-portal-506713['"]/.test(deploy));
pass('Deploy verifies current release before complete',/Production serves Portal v/.test(deploy) && /\$Release/.test(deploy) && /could not be verified[\s\S]*not marked complete/i.test(deploy));
pass('Deploy verifies USER_ACCESSING',/USER_ACCESSING/.test(deploy));
pass('Single deploy release constant is 4.9.1',/\$Release\s*=\s*['\"]4\.9\.1['\"]/.test(deploy));
pass('Deploy release regex derives from release constant',/\$ReleaseRegex\s*=\s*\[regex\]::Escape\(\$Release\)/.test(deploy));
const portalGateLine=deploy.split(/\r?\n/).find(l=>l.includes('Portal version is not'))||'';
pass('Portal version safety gate uses centralized release',portalGateLine.includes('$ReleaseRegex') && portalGateLine.includes('$Release'),portalGateLine.trim());
pass('Backend release safety gate uses centralized release',/\$trackerPattern[\s\S]*\$ReleaseRegex/.test(deploy) && /Backend release is not/.test(deploy));
pass('Live Sync release safety gate requires backend-derived release',/\$livePattern/.test(deploy) && /LIVE_SYNC_SETUP_RELEASE', PORTAL_BACKEND_RELEASE/.test(deploy) && /triggeredBy:portalSetupTriggerTag_/.test(deploy));
pass('Updater required release uses centralized release',/--required-release \$Release/.test(deploy));
pass('Setup URL uses centralized release',/action=setup&release=' \+ \$Release/.test(deploy));
pass('Production verification uses centralized release regex',/data-portal-version=.*\$ReleaseRegex/.test(deploy));
const criticalRuntime=[front,closeout,tracker,live,deploy,updater,read('ONE-CLICK-AUTO-DEPLOY.cmd'),read('CURRENT-RELEASE.txt')].join('\n');
pass('No stale 4.8.1/4.8.2/4.8.3/4.8.4 in current release-critical runtime',!/4\.8\.[1234]/.test(criticalRuntime));
const closeoutGateLine=deploy.split(/\r?\n/).find(l=>l.includes('$closeout -notmatch'))||'';
pass('Safety gate checks Closeout.gs via centralized release',closeoutGateLine.includes('$closeoutPattern') && /\$ReleaseRegex/.test(deploy),closeoutGateLine.trim());
pass('Safety gate requires Closeout.gs file',/Join-Path \$BackendDir 'Closeout\.gs'/.test(deploy));
pass('Deployer validator derives from centralized release',/\$ValidatorTool = Join-Path \$ToolsDir \('validate-v' \+ \$Release \+ '\.mjs'\)/.test(deploy));

pass('Updater waits for remote source + DOMAIN state',/waitForHeadState/.test(updater) && /REMOTE_SOURCE_POLICY_NOT_READY/.test(updater));
pass('Updater self-heals remote HEAD source + manifest before immutable version',/selfHealHeadState/.test(updater) && /overlayPackageSource/.test(updater) && /projects\/\$\{encodeURIComponent\(scriptId\)\}\/content/.test(updater));
pass('Remote self-heal preserves unknown remote files while overlaying package source',/writableFiles\(remoteFiles\)/.test(updater) && /overlayPackageSource/.test(updater) && /detectUnknownCoreCollisions/.test(updater));
pass('Remote source self-heal requires Google read-back',/REMOTE_SOURCE_READBACK_FAILED/.test(updater) && /waitForHeadState\(scriptId,token/.test(updater));
pass('Legacy ANYONE replacement tolerates Workspace 400 variants',/isLegacyAnyoneAccess/.test(updater) && /shouldCreateDomainReplacement/.test(updater) && /result\.status===400/.test(updater));
pass('Updater reports manifest self-heal mode',/manifestSelfHeal:head\.mode/.test(updater));
pass('Updater loads bundled backend source',/function loadLocalPackage/.test(updater) && /--backend-dir/.test(updater));
pass('Updater compares package source hashes',/SOURCE_HASH_MISMATCH/.test(updater) && /hashSource/.test(updater));
pass('Updater supports flexible Apps Script file names',/function stemOf/.test(updater) && /matchingFileIndexes/.test(updater));
pass('Updater blocks unknown core collisions',/REMOTE_UNKNOWN_CORE_COLLISION/.test(updater) && /detectUnknownCoreCollisions/.test(updater));
pass('One-click passes backend directory to updater',/--backend-dir \$BackendDir/.test(deploy));
pass('Live Sync trigger tag derives from backend release',/function portalSetupTriggerTag_/.test(live) && /triggeredBy:portalSetupTriggerTag_\(\)/.test(live));
pass('No stale hardcoded setup trigger tag',!/SETUP_V481/.test(live));
const updaterSelfTest=spawnSync(process.execPath,[path.join(root,'tools/update-apps-script-deployment.mjs'),'--self-test','--backend-dir',path.join(root,'backend'),'--required-release','4.9.1'],{encoding:'utf8'});
pass('Updater offline source-overlay self-test',updaterSelfTest.status===0 && /"ok":true/.test(String(updaterSelfTest.stdout||'')),String(updaterSelfTest.stdout||updaterSelfTest.stderr||'').trim().slice(0,260));

pass('One-click surfaces remote manifest self-heal result',/REMOTE MANIFEST SELF-HEAL/.test(deploy) && /manifestSelfHeal/.test(deploy));
pass('Updater verifies immutable version policy',/verifyVersionPolicy/.test(updater) && /versionNumber/.test(updater));
pass('Updater verifies immutable source against bundled package',/verifyVersionAttestation/.test(updater) && /attestCodeFiles/.test(updater) && /semanticReleaseAttestation/.test(updater) && /PEOPLE_SELF_HEAL_ORDER/.test(updater));
pass('One-click requires source-attested centralized release before setup',/sourceAttested/.test(deploy) && /attestedRelease/.test(deploy) && /attestedRelease -ne \$Release/.test(deploy));
pass('Updater detects Workspace ANYONE policy block',/ANYONE access has been disabled by your domain administrator/.test(updater));
pass('Updater creates DOMAIN replacement only on exact policy block',/created_domain_replacement/.test(updater) && /LEGACY_ANYONE_BLOCKED_BY_DOMAIN_POLICY/.test(updater));
pass('Updater preserves old deployment for rollback',/oldDeploymentPreserved:true/.test(updater));
pass('Updater verifies replacement DOMAIN access',/verifyDeployment/.test(updater) && /requiredAccess/.test(updater) && /requiredExecuteAs/.test(updater));
pass('One-click handles replacement deployment ID',/created_domain_replacement/.test(deploy) && /previousDeploymentId/.test(deploy));
pass('One-click rewrites frontend backend ID safely',/frontNow\.Replace\(\$previousDeploymentId,\$resolvedDeploymentId\)/.test(deploy));
pass('One-click refuses non-DOMAIN deployment result',/deployment is not DOMAIN \+ USER_ACCESSING/.test(deploy));
pass('Legacy PowerShell entry delegates to policy-safe flow',/AUTO-DEPLOY\.ps1/.test(read('deploy-one-click.ps1')));

let snap={}; try{snap=JSON.parse(snapshot)}catch{}
pass('Public fallback has zero requests',snap?.meta?.requestCount===0 && Array.isArray(snap.requests) && snap.requests.length===0);
pass('Public fallback contains no real corporate emails',!/[A-Za-z0-9._%+-]+@(shopee\.com|shopeemobile-external\.com)/i.test(snapshot));
pass('Frontend default user is fail-closed REQUESTER',/user:\{email:'',name:'Workspace User',role:'REQUESTER',status:'UNVERIFIED'/.test(front));
pass('No EffectiveUser identity fallback',!fs.readdirSync(path.join(root,'backend')).filter(x=>x.endsWith('.gs')).some(x=>/getEffectiveUser/.test(read('backend/'+x))));
const bootstrapAdmins=['bonus.sanwong@shopee.com','mook.siriprap@shopee.com','totoh.taponchai@shopee.com','first.thammaki@shopee.com','sellereducation.th@shopee.com'];
pass('Bootstrap admin recovery list is explicit seed ADMINs',bootstrapAdmins.every(e=>api.includes("'"+e+"'")) && /PORTAL_BOOTSTRAP_ADMIN_EMAILS/.test(api));
pass('Bootstrap admin recovery is pre-seed only',/function peopleBootstrapCompleted_/.test(api) && /PEOPLE_SEED_V474_STATUS/.test(api) && /!peopleBootstrapCompleted_\(\)/.test(api));
pass('Users sheet remains authoritative after bootstrap',/const u=rows\.find/.test(api) && /u&&String\(u\.role/.test(api) && /peopleBootstrapCompleted_/.test(api));
pass('No broad corporate admin fallback',!/!rows\.length\s*&&\s*\/@shopee/.test(api) && !/corporateEmail_\([^)]*\)\s*return true/.test(api));
const seed=read('backend/PeopleSeed.gs');
const seedArray=name=>{const m=seed.match(new RegExp('const\\s+'+name+'\\s*=\\s*(\\[.*?\\]);','s'));return m?JSON.parse(m[1]):[];};
const seedAdmins=[...seedArray('PEOPLE_SEED_V474_PART1'),...seedArray('PEOPLE_SEED_V474_PART2')].filter(r=>String(r.role||'').toUpperCase()==='ADMIN'&&r.active===true).map(r=>String(r.email||'').toLowerCase()).sort();
pass('All bootstrap admins exist as active ADMIN in bundled seed',bootstrapAdmins.slice().sort().join('|')===seedAdmins.join('|'),`bootstrap ${bootstrapAdmins.length} / seed ${seedAdmins.length}`);
pass('Live Sync setup self-heals People before admin gate',/function setupPortalLiveSync\(\)[\s\S]*ensurePeopleSeedV480ForSetup_\(email\)[\s\S]*assertAdminUser_\(email\)/.test(live) && live.indexOf('ensurePeopleSeedV480ForSetup_(email)')<live.indexOf('assertAdminUser_(email)'));
pass('Live Sync setup admin gate remains before trigger and source sync',live.indexOf('assertAdminUser_(email)')<live.indexOf('installPortalLiveSyncTrigger_') && live.indexOf('assertAdminUser_(email)')<live.indexOf('runPortalLiveSync({force:true'));
pass('Setup failure exposes resolved signed-in identity',/Signed in as/.test(tracker) && /Session\.getActiveUser\(\)\.getEmail\(\)/.test(tracker));
pass('Setup page visibly attests backend release',/Backend release: <strong>v/.test(tracker) && /PORTAL_BACKEND_RELEASE/.test(tracker));
pass('Setup request rejects backend release mismatch',/BACKEND RELEASE MISMATCH/.test(tracker) && /requestedRelease/.test(tracker));
pass('People seed contract remains 503',/PEOPLE_SEED_V474_EXPECTED\s*=\s*503/.test(read('backend/PeopleSeed.gs')));
pass('Inherited People self-heal is non-destructive for existing rows',/function ensurePeopleSeedV480ForSetup_/.test(seed) && /mode:'SKIP_EXISTING'/.test(seed) && /SETUP_SELF_HEAL_MISSING/.test(seed));
pass('Inherited People self-heal only repairs current bundled ADMIN before first READY',/SETUP_SELF_HEAL_ADMIN/.test(seed) && /adminSeed/.test(seed) && /liveSyncSetupReadyV480_/.test(seed));
pass('Inherited People self-heal refuses bootstrap overwrite after prior READY',/Automatic bootstrap repair is disabled to protect current role\/status decisions/.test(seed));


// v4.9.1 Triple-Source + Campaign 360 contracts
pass('PN source ID locked to approved tracker',/PORTAL_PN_SPREADSHEET_ID\s*=\s*['\"]1jCcfx0NExSfAzyj9a_lFYlIu3Re6qor9TIzaDATX7go['\"]/.test(tracker));
pass('SCA source ID locked to approved asset tracker',/PORTAL_SC_SPREADSHEET_ID\s*=\s*['\"]1f7ZFeR4a3fnQUBm3kOeoW7wLXRFKjvsIMpCOCu6teMI['\"]/.test(tracker));
pass('SCA required tabs are validated',/SUBMISSION FORM/.test(live) && /FINALIST/.test(live) && /PopUp Request Approval/.test(live));
pass('All three source workbooks are read-only by parser contract',!/SpreadsheetApp\.openById\(PORTAL_(?:PN|SC|SOCIAL)_SPREADSHEET_ID\)[\s\S]{0,400}\.(?:setValue|setValues|appendRow|clear|deleteRow|insertRow)\(/.test(live));
pass('Social source ID locked to approved dashboard',/PORTAL_SOCIAL_SPREADSHEET_ID\s*=\s*['\"]1x6Cbg2B0t9Ji79-hL5W16-UV_L7MCZTeg3YgtOnwikM['\"]/.test(tracker));
pass('Social source tab is Channel Schedule 2026',/getSheetByName\(['\"]Channel Schedule 2026['\"]\)/.test(live));
pass('Social source registered in sync engine',/PORTAL_SYNC_SOURCE_SOCIAL\s*=\s*['\"]SRC-SOCIAL-2026['\"]/.test(live) && /PORTAL_SYNC_RULESET_SOCIAL/.test(live));
pass('Triple-source setup requires PN SCA Social checkpoints',/!pnCheckpoint\s*\|\|\s*!scCheckpoint\s*\|\|\s*!socialCheckpoint/.test(live) && /PN, SCA and Social successful sync checkpoints/.test(live));
pass('Triple-source freshness watches Social',/socialUpdated/.test(live) && /sourceModifiedAt.*social/i.test(live));
pass('Production health exposes Social checkpoint',/socialCheckpoint:social/.test(closeout) && /scaCheckpoint:sc/.test(closeout) && /pnCheckpoint:pn/.test(closeout));
pass('Tracker metadata exposes three source counts',/pnCount/.test(tracker) && /scCount/.test(tracker) && /socialCount/.test(tracker));
pass('Portal metadata names triple source',/PN \+ SCA \+ Social Media Google Sheets/.test(tracker));
pass('Social parser filters to 2026 live date',/liveDate\.getFullYear\(\)!==cfg\.year/.test(live) && /cfg\.year/.test(live));
pass('Social parser supports required social channels',/add\(['\"]Facebook['\"]\)/.test(live) && /add\(['\"]Facebook Group['\"]\)/.test(live) && /add\(['\"]YouTube['\"]\)/.test(live) && /add\(['\"]TikTok['\"]\)/.test(live) && /add\(['\"]Instagram['\"]\)/.test(live) && /add\(['\"]LINE['\"]\)/.test(live));
pass('Social parser does not explicitly import SHP or SEH',!/add\(['\"]SHP['\"]\)/.test(live) && !/add\(['\"]SEH['\"]\)/.test(live));
for(const status of ['PUBLISHED','DONE','SCHEDULED','READY','POSTPONED','HOLD','WAITING','WORKING','TENTATIVE']) pass('Social status mapping: '+status,new RegExp(status).test(live));
pass('Social Ready is not auto-approved',/x===['\"]READY['\"][\s\S]*READY_FOR_REVIEW/.test(live));
pass('Social hold states remain non-destructive submitted state',/POSTPONED\|HOLD\|WAITING/.test(live) && /SOCIAL_HOLD/.test(live));
pass('Social source rows are read-only and mapped to GOOGLE_SHEETS_SOCIAL',/source_system:['\"]GOOGLE_SHEETS_SOCIAL['\"]/.test(live));

pass('SCA approval source sheet hooked',/getSheetByName\(['\"]PopUp Request Approval['\"]\)/.test(live));
pass('SCA approval Campaign header tolerates line breaks',/headerIndexesMatching_\(headers,\/\^Campaign Name\/i\)/.test(live));
pass('SCA approval separates Manager Approve Comment Status',/Manager Approve/.test(live) && /workflowStatus/.test(live) && /comment/.test(live));
pass('Blank SCA Manager Approve is not rejection',/else if\(isScPopupAsset_\(s\.assetType\)\)status=['\"]PENDING_REVIEW['\"]/.test(live) && !/!manager.*REJECTED/.test(live));
pass('Explicit SCA manager rejection is recognized',/REJECT\|REJECTED\|NOT APPROVED/.test(live));
pass('Explicit SCA manager approval is recognized',/YES\|Y\|APPROVE\|APPROVED\|TRUE/.test(live));
pass('SCA FINALIST allocation can approve operationally',/APPROVED_BY_ALLOCATION/.test(live) && /truth_\(finalist\.scheduled\)/.test(live));
pass('SCA FINALIST rejection/cancel/full slot can reject operationally',/REJECTED_BY_ALLOCATION/.test(live) && live.includes('FULL\\s*SLOT'));
pass('SCA validation explicitly not approval',/VALIDATION_IS_NOT_APPROVAL/.test(live) && /Title\/Content validation is readiness only/.test(front));
pass('SCA approval conflicts are surfaced',/assetApprovalConflict/.test(tracker) && /Conflicting evidence/.test(front));
pass('SCA request table surfaces asset approval state',/Approval: \$\{esc\(r\.assetApprovalStatus\)/.test(front));

pass('Backend builds Campaign 360 aggregation',/function buildCampaign360_/.test(tracker) && /campaigns:buildCampaign360_\(requests\)/.test(tracker));
pass('Campaign 360 groups simple content-N variants',/content\s*\\s*\\d\+/.test(tracker) || /content\\s\*\\d/.test(tracker));
pass('Campaign 360 navigation present',/data-page=['\"]campaigns['\"]/.test(front) && />Campaign 360</.test(front));
pass('Campaign 360 page present',/id=['\"]page-campaigns['\"]/.test(front) && /id=['\"]campaignSourceBanner['\"]/.test(front));
pass('Campaign 360 has source and status filters',/id=['\"]campaignSourceFilter['\"]/.test(front) && /id=['\"]campaignStatusFilter['\"]/.test(front));
pass('Campaign 360 renderer present',/function renderCampaigns\(/.test(front) && /function openCampaignModal\(/.test(front));
pass('Campaign 360 source matrix preserves request IDs',/Source Matrix/.test(front) && /r\.id/.test(front));
pass('Campaign 360 keeps source chips',/function sourceChip\(/.test(front) && /PN/.test(front) && /SCA/.test(front) && /SOCIAL/.test(front));
pass('Campaign 360 beginner guide present',/id:['\"]campaign-360['\"]/.test(front));
pass('Asset Approval beginner guide present',/id:['\"]asset-approval['\"]/.test(front));
pass('Campaign page included in permitted page sets',/campaigns/.test(front) && /allowedPagesForMode/.test(front));
pass('Frontend payload supports campaigns',/campaigns:\[\]/.test(front) && /base\.campaigns=Array\.isArray\(p\.campaigns\)/.test(front));


const writeMap=['submitRequest','updateRequest','saveReviewDecision','saveReviewComment','saveCycleRule','createSmartLink','createContent','analyzeContent','uploadArtwork','saveLookup','deleteLookup','saveBusinessConfig','saveScoringModelVersion','queueApiPublication','testApiConnection','approveApiPublication','sendApiPublication','saveTeamMember','massImportUsers'];
for(const m of writeMap) pass('Frontend write bridge: '+m,new RegExp("\\b"+m+":'[^']+'").test(front));
const called=[...front.matchAll(/Api\.call\('([^']+)'/g)].map(m=>m[1]);
const uniq=[...new Set(called)].sort();
const backends=fs.readdirSync(path.join(root,'backend')).filter(x=>x.endsWith('.gs')).map(x=>read('backend/'+x)).join('\n');
for(const m of uniq) pass('Embedded RPC exists: '+m,new RegExp('function\\s+'+m+'\\s*\\(').test(backends));

const routes=['request.create','request.update','review.decision','review.comment','cycle.save','smartlink.create','content.create','content.analyze','artwork.upload','lookup.save','lookup.delete','config.save','scoring.version','api.queue','api.status','api.approve','api.send','people.save','people.massImport','sync.now'];
for(const a of routes) pass('doPost route: '+a,new RegExp("action==='"+a.replace('.','\\.')+"'").test(api));
pass('API queue route is role-gated',/api\.queue'\)data=apiCenterQueuePublicationV475_\(payload,email\)/.test(api));
pass('Manual sync route is role-gated',/sync\.now'\)data=authorizedSyncNow_\(email\)/.test(api));
pass('API send remains fail-closed until verified',/contract!==['"]VERIFIED['"]\|\|!enabled/.test(closeout) && /Approved API endpoint is not configured server-side/.test(closeout));
pass('API Center blocks sensitive publication',/NON_SENSITIVE/.test(read('backend/ApiCenter.gs')) && /Specific Seller List is blocked/.test(read('backend/ApiCenter.gs')));

pass('Canonical Requests schema self-heals',/ensureSheetColumns_\(ss,'Requests'/.test(closeout) && /portal_workflow_status/.test(closeout));
pass('Canonical Comms_Items schema self-heals',/ensureSheetColumns_\(ss,'Comms_Items'/.test(closeout));
pass('Native request writes canonical status',/source_system:'PORTAL_NATIVE'/.test(api) && /status:status/.test(api));
pass('Native request persists channels as asset_type',/asset_type:ch/.test(api));
pass('Request edit maps campaign to campaign_name',/fields\.campaign_name=input\.campaign/.test(api));
pass('Request edit maps startDate to start_date',/fields\.start_date=input\.startDate/.test(api));
pass('Request edit persists destination to Comms_Items',/ifields\.destination_url=input\.destinationUrl/.test(api));
pass('Request edit persists detail/key message',/ifields\.key_message=input\.detail/.test(api));
pass('Source-synced requester edits blocked',/Source-synced requests are read-only in the Portal/.test(closeout) && /GOOGLE_SHEETS_/.test(front));
pass('Source review workflow overlay persists',/portal_workflow_status/.test(api) && /r\.portal_workflow_status\|\|r\.status/.test(tracker));
pass('Review comments restored on reload',/applyReviewNotesV475_/.test(closeout) && /applyReviewNotesV475_\(requestRows\.map/.test(tracker));
pass('Multi-channel native request DTO supported',/itemsByRequest/.test(tracker) && /nativeAssets/.test(tracker));
pass('Artwork writes matching asset item',/x\.asset_type\|\|['"]['"]\)===String\(p\.assetType/.test(api));

const peopleHeaders=['email','display_name','role','department','team_cluster','team_category','team_role','team','manager_email','active','can_review_pn','can_review_sc','can_review_artwork','can_manage_cycles','can_manage_notifications'];
pass('Mass Upload current template complete',peopleHeaders.every(h=>front.includes("'"+h+"'")));
pass('Mass Upload runs through write bridge',/Api\.call\('massImportUsers'/.test(front) && /people\.massImport/.test(front));
pass('Team hierarchy persists',/team_cluster:parts\.cluster/.test(api) && /team_category:parts\.category/.test(api) && /team_role:parts\.role/.test(api));

pass('Content create persists',/function createPortalContent_/.test(closeout) && /content\.create/.test(api));
pass('Lookup CRUD persists',/function saveLookup_/.test(closeout) && /function deleteLookup_/.test(closeout));
pass('Business config persists with history',/function saveBusinessConfig_/.test(closeout) && /Config_History/.test(closeout));
pass('Scoring version persists',/function saveScoringModelVersion_/.test(closeout) && /Scoring_Models/.test(closeout));
pass('Production health exposed',/systemHealth:getPortalHealthSummary_\(\)/.test(tracker) && /Production Health/.test(front));

const htmlIds=[...front.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);
pass('Static DOM has no duplicate IDs',new Set(htmlIds).size===htmlIds.length,`ids ${htmlIds.length}`);
pass('Portal page/settings structure preserved',(front.match(/<section class="page[^>]*data-page-panel=/g)||[]).length===14 && (front.match(/data-settings-tab=/g)||[]).length===7);
pass('Beginner Guidance stylesheet present',/id="beginner-guidance-v480"/.test(front));
pass('Beginner Guides topbar toggle present',/id="beginnerGuideToggle"/.test(front) && /Beginner Guides/.test(front));
pass('Hover tooltip surface present',/id="beginnerGuideTooltip"/.test(front) && /role="tooltip"/.test(front));
pass('Scroll guide card surface present',/id="beginnerGuideCard"/.test(front) && /aria-live="polite"/.test(front));
pass('Beginner guide definitions present',/const BEGINNER_GUIDE_DEFINITIONS=\[/.test(front));
const guideIds=[...front.matchAll(/\{id:'([^']+)',page:/g)].map(m=>m[1]);
pass('Beginner guide coverage >= 24 hotspots',guideIds.length>=24,`found ${guideIds.length}`);
for(const id of ['campaign-360','asset-approval','dashboard-heat','request-wizard','request-channels','command-board','grading-policy','content-intelligence','smartlink-quick','api-policy','api-queue','export-center','people-editor','mass-upload','business-config','cycle-rules','scoring-settings','production-health'])pass('Required guide hotspot: '+id,guideIds.includes(id));
pass('Scroll-trigger guide uses IntersectionObserver',/new IntersectionObserver/.test(front) && /intersectionRatio<\.52/.test(front));
pass('Hover guide uses delegated mouseover',/addEventListener\('mouseover'/.test(front) && /showTooltip/.test(front));
pass('Keyboard focus guide supported',/addEventListener\('focusin'/.test(front) && /addEventListener\('focusout'/.test(front));
pass('Escape closes guide',/e\.key==='Escape'/.test(front));
pass('Guide state is per user and local',/sellerCommsBeginnerGuides_/.test(front) && /userToken/.test(front));
pass('Beginner guidance defaults ON',/enabled:parsed\.enabled!==false/.test(front));
pass('Guide seen-state prevents repeated auto popup',/read\(\)\.seen\.includes\(def\.id\)/.test(front));
pass('Guide actions Got it Next Disable present',/id="beginnerGuideGotIt"/.test(front) && /id="beginnerGuideNext"/.test(front) && /id="beginnerGuideDisable"/.test(front));
pass('Guide Center integrated with Help',/Beginner Guide Center/.test(front) && /BeginnerGuides\.helpHtml\(\)/.test(front));
pass('Guide Center can restart page tour',/guideRestartPage/.test(front) && /restartPage/.test(front));
pass('Page navigation refreshes guidance',/function showPage[\s\S]*BeginnerGuides\.refresh\(\)/.test(front));
pass('Settings tab refreshes guidance',/function showSettingsTab[\s\S]*BeginnerGuides\.refresh\(\)/.test(front));
pass('Dynamic modal refreshes guidance',/function openModal[\s\S]*BeginnerGuides\.refresh\(\)/.test(front));
pass('Mobile tooltip safely suppressed',/@media\(max-width:720px\)[\s\S]*\.beginner-guide-tooltip\{display:none\}/.test(front));

pass('All data writes clear v3 cache',/portalClearDataCache_/.test(api) && /portal_data_live_v3/.test(closeout));

function fnBody(src,name){const i=src.indexOf('function '+name); if(i<0)return ''; let b=src.indexOf('{',i),depth=0; for(let j=b;j<src.length;j++){if(src[j]==='{')depth++;else if(src[j]==='}'){depth--;if(depth===0)return src.slice(i,j+1);}} return '';}
for(const name of ['parsePnSource_','parseScSource_','buildScFinalistMap_','buildScApprovalMap_','parseSocialSource_']){const body=fnBody(live,name);pass('Source parser read-only: '+name,!!body && !/\.setValue\(|\.setValues\(|\.appendRow\(|\.clear\(|\.deleteRow\(|\.insertRow/.test(body));}

try{const scripts=[...front.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);new vm.Script(scripts.at(-1));pass('Frontend JavaScript syntax',true);}catch(e){pass('Frontend JavaScript syntax',false,e.message);}
for(const f of fs.readdirSync(path.join(root,'backend')).filter(x=>x.endsWith('.gs'))){try{new vm.Script(read('backend/'+f));pass('Backend syntax: '+f,true);}catch(e){pass('Backend syntax: '+f,false,e.message);}}

const failures=checks.filter(x=>!x.ok);
console.log(`Seller Communication Portal v4.9.1 validation: ${checks.length-failures.length}/${checks.length} PASS`);
for(const c of checks) console.log(`${c.ok?'PASS':'FAIL'} - ${c.name}${c.detail?' :: '+c.detail:''}`);
if(failures.length){console.error(`\n${failures.length} validation check(s) failed.`);process.exit(1);}

const opsTests=spawnSync(process.execPath,[path.join(root,'tools/test-content-operations.mjs')],{encoding:'utf8'}); console.log(opsTests.stdout); if(opsTests.status!==0){console.error(opsTests.stderr);process.exitCode=1;}

const recoveryTests=spawnSync(process.execPath,[path.join(root,'tools/test-gateway-migration.mjs')],{encoding:'utf8'});console.log(recoveryTests.stdout);if(recoveryTests.status!==0){console.error(recoveryTests.stderr);process.exitCode=1;}
