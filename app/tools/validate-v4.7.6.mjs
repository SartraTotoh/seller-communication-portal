import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..');
const read=r=>fs.readFileSync(path.join(root,r),'utf8');
const checks=[]; const pass=(name,ok,detail='')=>{checks.push({name,ok,detail}); if(!ok) process.exitCode=1;};
const front=read('public/index.html'), api=read('backend/PortalApi.gs'), closeout=read('backend/Closeout.gs'), tracker=read('backend/TrackerSync.gs'), live=read('backend/LiveSyncEngine.gs'), manifest=JSON.parse(read('backend/appsscript.json')), firebaserc=JSON.parse(read('.firebaserc')), firebase=JSON.parse(read('firebase.json')), deploy=read('AUTO-DEPLOY.ps1'), snapshot=read('public/data/requests-2026.json');

pass('Portal version 4.7.6',/data-portal-version="4\.7\.6"/.test(front));
pass('Functional baseline 4.6.0 preserved',/data-functional-baseline="4\.6\.0"/.test(front));
pass('UI baseline 4.6.8 preserved',/data-ui-version="4\.6\.8"/.test(front));
pass('Backend closeout release 4.7.6',/PORTAL_CLOSEOUT_RELEASE\s*=\s*['"]4\.7\.6['"]/.test(closeout));
pass('Backend release 4.7.6',/PORTAL_BACKEND_RELEASE\s*=\s*['"]4\.7\.6['"]/.test(tracker));
pass('Apps Script executes as user accessing',manifest.webapp?.executeAs==='USER_ACCESSING');
pass('Apps Script domain access',manifest.webapp?.access==='DOMAIN');
pass('Firebase target hard-locked',firebaserc.projects?.default==='seller-communication-portal');
pass('Firebase Hosting-only',!!firebase.hosting && !firebase.functions && !firebase.firestore && !firebase.storage);
pass('Deploy blocks THSP project',/ForbiddenProjectId\s*=\s*['"]education-portal-506713['"]/.test(deploy));
pass('Deploy verifies v4.7.6 before complete',/Production serves Portal v4\.7\.6/.test(deploy) && /could not be verified[\s\S]*not marked complete/i.test(deploy));
pass('Deploy verifies USER_ACCESSING',/USER_ACCESSING/.test(deploy));

const updater=read('tools/update-apps-script-deployment.mjs');
pass('Updater waits for remote DOMAIN manifest',/waitForHeadPolicy/.test(updater) && /REMOTE_MANIFEST_POLICY_NOT_READY/.test(updater));
pass('Updater verifies immutable version policy',/verifyVersionPolicy/.test(updater) && /versionNumber/.test(updater));
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
pass('Only explicit bootstrap admin continuity',/PORTAL_BOOTSTRAP_ADMIN_EMAILS\s*=\s*\['sellereducation\.th@shopee\.com'\]/.test(api) && !/!rows\.length\s*&&\s*\/@shopee/.test(api));
pass('People seed contract remains 503',/PEOPLE_SEED_V474_EXPECTED\s*=\s*503/.test(read('backend/PeopleSeed.gs')));

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
pass('All data writes clear v3 cache',/portalClearDataCache_/.test(api) && /portal_data_live_v3/.test(closeout));

function fnBody(src,name){const i=src.indexOf('function '+name); if(i<0)return ''; let b=src.indexOf('{',i),depth=0; for(let j=b;j<src.length;j++){if(src[j]==='{')depth++;else if(src[j]==='}'){depth--;if(depth===0)return src.slice(i,j+1);}} return '';}
for(const name of ['parsePnSource_','parseScSource_','buildScFinalistMap_']){const body=fnBody(live,name);pass('Source parser read-only: '+name,!!body && !/\.setValue\(|\.setValues\(|\.appendRow\(|\.clear\(|\.deleteRow\(|\.insertRow/.test(body));}

try{const scripts=[...front.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);new vm.Script(scripts.at(-1));pass('Frontend JavaScript syntax',true);}catch(e){pass('Frontend JavaScript syntax',false,e.message);}
for(const f of fs.readdirSync(path.join(root,'backend')).filter(x=>x.endsWith('.gs'))){try{new vm.Script(read('backend/'+f));pass('Backend syntax: '+f,true);}catch(e){pass('Backend syntax: '+f,false,e.message);}}

const failures=checks.filter(x=>!x.ok);
console.log(`Seller Communication Portal v4.7.6 validation: ${checks.length-failures.length}/${checks.length} PASS`);
for(const c of checks) console.log(`${c.ok?'PASS':'FAIL'} - ${c.name}${c.detail?' :: '+c.detail:''}`);
if(failures.length){console.error(`\n${failures.length} validation check(s) failed.`);process.exit(1);}
