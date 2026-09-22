import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const tools=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(tools,'..');
const backend=path.join(root,'backend');
let fail=0;function pass(name,ok){console.log((ok?'PASS ':'FAIL ')+name);if(!ok)fail++;}
const text=p=>fs.readFileSync(p,'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const protectedHashes={
 'ApiCenter.gs':'ea67d3bbbf659326a355ef5512e90cf59484745d386d292fd6ac5c39b5745017',
 'ContentOperations.gs':'b627f4fe90c28ba9959da826baea05afabe63ceac04bd443407b1212bfd96ada',
 'CycleEngine.gs':'714cb13f0aa4c7f72e9aaebe50b4a690cab1591bc2c6c314e0268c3545f8a301',
 'LiveSyncEngine.gs':'1abd06e0543fa1e46fcce09343e3946baa6c2661b03f9aab02cec411c74dcf19',
 'PeopleImportUi.gs':'55aa8f16f242da813d8ec17889727caeb685b543449f7577a051eacf0d633c50',
 'PeopleSeed.gs':'becb7efe4803d56a74143b03625099a9f2cc18de652df6fa0d7c973f02ec62e9'
};
for(const [n,h] of Object.entries(protectedHashes))pass('Protected data/business logic unchanged: '+n,sha(path.join(backend,n))===h);
const manifest=JSON.parse(text(path.join(backend,'appsscript.json')));
pass('Central data backend access = DOMAIN',manifest?.webapp?.access==='DOMAIN');
pass('Central data backend executes as deployer',manifest?.webapp?.executeAs==='USER_DEPLOYING');
const bridgeManifest=JSON.parse(text(path.join(root,'auth-bridge','appsscript.json')));
pass('Auth bridge access = DOMAIN',bridgeManifest?.webapp?.access==='DOMAIN');
pass('Auth bridge executes as user',bridgeManifest?.webapp?.executeAs==='USER_ACCESSING');
pass('Auth bridge OAuth scope is email only',Array.isArray(bridgeManifest.oauthScopes)&&bridgeManifest.oauthScopes.length===1&&bridgeManifest.oauthScopes[0]==='https://www.googleapis.com/auth/userinfo.email');
const bridgeCode=text(path.join(root,'auth-bridge','Code.gs'));
pass('Auth bridge requires explicit top-level Continue link',/target=\"_top\"/.test(bridgeCode)&&/Continue to Seller Communication Portal/.test(bridgeCode));
pass('Auth bridge no longer navigates inside its sandbox iframe',!/location\.replace\s*\(/.test(bridgeCode));
pass('Auth handoff carries signed session only in URL fragment',/\?workspace=verified#scp_session=/.test(bridgeCode));
const auth=text(path.join(backend,'AuthSession.gs'));
pass('Backend has secret placeholder only',auth.includes('__SCP_AUTH_SESSION_SECRET__')&&!auth.match(/const PORTAL_AUTH_SESSION_SECRET = '[A-Za-z0-9_-]{32,}'/));
pass('Backend verifies HMAC session',/computeHmacSha256Signature/.test(auth)&&/WORKSPACE_SESSION_INVALID/.test(auth)&&/WORKSPACE_SESSION_EXPIRED/.test(auth));
const closeout=text(path.join(backend,'Closeout.gs'));
pass('Viewer identity prefers signed session',/portalHttpSessionEmail_/.test(closeout)&&/WORKSPACE_SESSION_REQUIRED/.test(closeout));
const tracker=text(path.join(backend,'TrackerSync.gs'));
pass('Read gateway authorizes signed session',/portalAuthorizeHttpSession_/.test(tracker)&&/portalData','portalMeta','health','syncNow/.test(tracker));
const api=text(path.join(backend,'PortalApi.gs'));
pass('Write gateway authorizes signed session',/portalAuthorizeHttpSession_\(sessionToken\)/.test(api)&&/e\.parameter\.session/.test(api));
pass('Smart Link handlers remain present',/smartlink\.create/.test(api)&&/smartlink\.configure/.test(api)&&/smartlink\.backfill/.test(api));
const front=text(path.join(root,'public','index.html'));
pass('Frontend release remains v4.9.3',/data-portal-version="4\.9\.3"/.test(front));
pass('Frontend auth URL is deploy-time placeholder',front.includes("const SCP_AUTH_BRIDGE_URL='__SCP_AUTH_BRIDGE_URL__'"));
pass('Frontend stores auth token in sessionStorage',/sessionStorage\.setItem\(SCP_AUTH_SESSION_KEY/.test(front));
pass('Frontend GET sends signed session',/session=\$\{encodeURIComponent\(workspaceSession\)\}/.test(front));
pass('Frontend POST sends signed session',/add\('session',workspaceSession\)/.test(front));
pass('Frontend no longer lets stale endpoint override deployed endpoint',/window\.PORTAL_SYNC_ENDPOINT\|\|DEFAULT_ENDPOINT\|\|config\?\.value\|\|storageGet\(ENDPOINT_KEY\)/.test(front));
pass('Frontend redirects to Workspace auth when session missing',/if\(!scpWorkspaceSession\(\)\)\{scpStartWorkspaceLogin\(\);return;\}/.test(front));
const recovery=text(path.join(tools,'r44-workspace-login-recovery.mjs'));
const bridgeHelper=text(path.join(tools,'ensure-auth-bridge-r44.mjs'));
const updater=text(path.join(tools,'update-apps-script-deployment.mjs'));
pass('Auth bridge CREATE body is flat per Apps Script API',/const createBody=\{versionNumber,manifestFileName:'appsscript',description:/.test(bridgeHelper)&&!/POST',\{deploymentConfig:/.test(bridgeHelper));
pass('Auth bridge UPDATE body remains deploymentConfig wrapped',/const updateBody=\{deploymentConfig:\{scriptId,versionNumber,manifestFileName:'appsscript'/.test(bridgeHelper));
pass('Central replacement CREATE body is flat',/const createBody=\{versionNumber,manifestFileName,description:description\+' - DOMAIN replacement'\}/.test(updater));
pass('Recovery deploy scope is Hosting only',recovery.includes("['deploy','--project',projectId,'--only','hosting','--non-interactive']"));
pass('Recovery never calls setupPortalLiveSync',!recovery.includes('setupPortalLiveSync'));
pass('Recovery never names Tracking_Links for mutation',!/(appendRow|setValue|deleteRow).*Tracking_Links/i.test(recovery));
if(fail){console.error(`R4.4 validation failed: ${fail}`);process.exit(1);}console.log('R4.4 validation PASS');
