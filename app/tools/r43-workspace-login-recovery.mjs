import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const toolsDir=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(toolsDir,'..');
const backendDir=path.join(root,'backend');
const publicDir=path.join(root,'public');
const projectId='seller-communication-portal';
const projectNumber='795035951703';
const release='4.9.3';
const localStateDir=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'SellerCommunicationPortal');
const backendStateFile=path.join(localStateDir,'deploy-state.json');
const authStateFile=path.join(localStateDir,'workspace-auth-bridge-r42.json');
const reportDir=path.join(root,'ACCESS_RECOVERY_REPORT_R4_3');
const currentFront=fs.readFileSync(path.join(publicDir,'index.html'),'utf8');
const endpointMatch=currentFront.match(/https:\/\/script\.google\.com\/(?:a\/macros\/shopee\.com\/|macros\/)s\/(AKfy[A-Za-z0-9_-]+)\/exec/);
const packagedDeploymentId=endpointMatch?.[1]||'';

function out(msg='',color=''){const c={green:'\x1b[32m',yellow:'\x1b[33m',red:'\x1b[31m',cyan:'\x1b[36m'}[color]||'';const r=c?'\x1b[0m':'';console.log(c+msg+r);}
function stop(msg){out('\nSTOP: '+msg,'red');out('Existing Google Sheets / Tracking_Links / Short_Link_Routes were not reset.','yellow');process.exit(1);}
function readJson(p){return JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2),'utf8');}
function run(command,args,opts={}){return spawnSync(command,args,{encoding:'utf8',windowsHide:false,...opts});}
function runNode(script,args,inherit=false,cwd=root){const r=run(process.execPath,[script,...args],{cwd,stdio:inherit?'inherit':'pipe'});return r;}
function parseJsonStdout(r,label){const text=String(r.stdout||'').trim();try{return JSON.parse(text);}catch{stop(label+' returned unreadable output: '+text.slice(0,500));}}
function ensureClaspAuth(){
  const authFile=process.env.clasp_config_auth||process.env.CLASP_CONFIG_AUTH||path.join(os.homedir(),'.clasprc.json');
  if(fs.existsSync(authFile))return authFile;
  out('  Google Apps Script sign-in is required once.','yellow');
  const npx=process.platform==='win32'?'npx.cmd':'npx';
  const r=run(npx,['--yes','@google/clasp@3.3.0','login'],{stdio:'inherit',cwd:root,shell:process.platform==='win32'});
  if(r.status!==0||!fs.existsSync(authFile))stop('Apps Script sign-in did not complete.');
  return authFile;
}
function locateFirebase(){
  const c=[];
  for(const base of [process.env.APPDATA,process.env.LOCALAPPDATA].filter(Boolean))c.push(path.join(base,'npm','node_modules','firebase-tools','lib','bin','firebase.js'));
  const npm=process.platform==='win32'?'npm.cmd':'npm';
  const nr=run(npm,['root','-g']);
  if(nr.status===0&&String(nr.stdout||'').trim())c.push(path.join(String(nr.stdout).trim(),'firebase-tools','lib','bin','firebase.js'));
  for(const p of c)if(fs.existsSync(p))return {kind:'node',path:p};
  const where=process.platform==='win32'?run('where',['firebase.cmd']):run('which',['firebase']);
  const p=String(where.stdout||'').split(/\r?\n/).map(x=>x.trim()).find(Boolean);
  if(p)return {kind:'cmd',path:p};
  stop('Firebase CLI is not installed. R3 used it successfully, so do not install another copy manually; reopen the same Windows profile and rerun.');
}
function firebase(cli,args,{inherit=false,cwd=root}={}){
  if(cli.kind==='node')return run(process.execPath,[cli.path,...args],{cwd,stdio:inherit?'inherit':'pipe'});
  return run(cli.path,args,{cwd,stdio:inherit?'inherit':'pipe',shell:process.platform==='win32'});
}
function verifyFirebase(cli){
  const r=firebase(cli,['projects:list','--json','--non-interactive']);
  if(r.status!==0)return false;
  let j;try{j=JSON.parse(String(r.stdout||'').trim());}catch{return false;}
  const rows=Array.isArray(j?.result)?j.result:Array.isArray(j)?j:[];
  const hit=rows.find(p=>String(p.projectId||'')===projectId);
  if(!hit)return false;
  if(String(hit.projectNumber||'')!==projectNumber)stop('Firebase project number mismatch. Hard stop.');
  return true;
}
function ensureFirebaseAccess(cli){
  if(verifyFirebase(cli))return;
  out('  Firebase sign-in is required once.','yellow');
  const r=firebase(cli,['login','--reauth'],{inherit:true});
  if(r.status!==0||!verifyFirebase(cli))stop('Current Firebase account cannot access seller-communication-portal.');
}
function currentBackendIdentity(){
  let state={};try{if(fs.existsSync(backendStateFile))state=readJson(backendStateFile);}catch{}
  let deploymentId=String(state.deploymentId||packagedDeploymentId||'');
  let scriptId=String(state.scriptId||'');
  if(scriptId&&deploymentId)return {scriptId,deploymentId,state};
  if(!deploymentId)stop('Current Apps Script deployment ID could not be found.');
  const input=path.join(os.tmpdir(),'scp-r42-candidates-'+Date.now()+'.json');
  fs.writeFileSync(input,JSON.stringify({deploymentId,candidates:[]}), 'utf8');
  try{
    const r=runNode(path.join(toolsDir,'resolve-apps-script-owner.mjs'),['--deployment',deploymentId,'--candidates',input]);
    const j=parseJsonStdout(r,'Apps Script owner resolver');
    if(r.status!==0||!j.ok||!j.scriptId)stop('Current Apps Script deployment owner could not be resolved.');
    scriptId=String(j.scriptId);
    return {scriptId,deploymentId,state:{}};
  }finally{try{fs.unlinkSync(input);}catch{}}
}
function copyDir(src,dst){fs.cpSync(src,dst,{recursive:true});}
function replaceOnce(text,from,to,label){if(!text.includes(from))stop(label+' placeholder was not found.');return text.replace(from,to);}
async function fetchText(url,ms=8000){
  const c=new AbortController();const t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{cache:'no-store',signal:c.signal,headers:{'cache-control':'no-cache'}});return {ok:r.ok,status:r.status,text:await r.text()};}
  catch(e){return {ok:false,status:0,text:String(e?.message||e)};}finally{clearTimeout(t);}
}
async function verifyHosting(marker){
  const urls=['https://seller-communication-portal.web.app/release-v4.9.3-r4.3.json','https://seller-communication-portal.firebaseapp.com/release-v4.9.3-r4.3.json'];
  for(let attempt=1;attempt<=6;attempt++){
    for(const base of urls){const u=base+'?t='+Date.now();const r=await fetchText(u);if(r.ok&&r.text.includes(marker))return true;}
    await new Promise(r=>setTimeout(r,1500));
  }
  return false;
}
function openUrl(url){
  if(process.platform==='win32')spawnSync('cmd.exe',['/d','/s','/c','start','',url],{stdio:'ignore',windowsHide:true});
  else if(process.platform==='darwin')spawnSync('open',[url],{stdio:'ignore'});
  else spawnSync('xdg-open',[url],{stdio:'ignore'});
}

out('===============================================================');
out(' Seller Communication Portal v4.9.3R4.3 - WORKSPACE LOGIN BRIDGE');
out(' DATA SAFE: auth/deployment/Hosting only; NO setup; NO Sheets reset');
out('===============================================================');

out('\n[1/6] Safety + accounts...','cyan');
for(const p of [path.join(backendDir,'AuthSession.gs'),path.join(backendDir,'Closeout.gs'),path.join(backendDir,'TrackerSync.gs'),path.join(backendDir,'PortalApi.gs'),path.join(root,'auth-bridge','Code.gs'),path.join(root,'auth-bridge','appsscript.json'),path.join(publicDir,'index.html'),path.join(root,'firebase.json'),path.join(root,'.firebaserc')])if(!fs.existsSync(p))stop('Missing required file: '+p);
if(!currentFront.includes('data-portal-version="4.9.3"'))stop('Portal release is not v4.9.3.');
if(!currentFront.includes('__SCP_AUTH_BRIDGE_URL__'))stop('R4.2 auth bridge placeholder is missing.');
if(!fs.readFileSync(path.join(backendDir,'AuthSession.gs'),'utf8').includes('__SCP_AUTH_SESSION_SECRET__'))stop('R4.2 backend secret placeholder is missing.');
ensureClaspAuth();
const fb=locateFirebase();ensureFirebaseAccess(fb);
out('  Firebase target verified: seller-communication-portal','green');

out('\n[2/6] Resolving current centralized data backend...','cyan');
const backend=currentBackendIdentity();
out('  Current data backend deployment: '+backend.deploymentId,'green');
out('  Current data backend Script ID: '+backend.scriptId,'green');

out('\n[3/6] Creating/reusing minimal Workspace identity bridge...','cyan');
fs.mkdirSync(localStateDir,{recursive:true});
let bridgeRun=runNode(path.join(toolsDir,'ensure-auth-bridge.mjs'),['--bridge-dir',path.join(root,'auth-bridge'),'--state',authStateFile]);
let bridgeDiag=parseJsonStdout(bridgeRun,'Auth bridge');
if(bridgeRun.status!==0||!bridgeDiag.ok)stop('Workspace identity bridge failed: '+String(bridgeDiag.error||'unknown error'));
const authState=readJson(authStateFile);
const secret=String(authState.secret||'');const authUrl=String(bridgeDiag.url||authState.url||'');
if(secret.length<32)stop('Workspace bridge secret was not generated safely.');
if(!/^https:\/\/script\.google\.com\/(?:a\/macros\/shopee\.com\/|macros\/)s\/AKfy[A-Za-z0-9_-]+\/exec$/i.test(authUrl))stop('Workspace auth bridge URL is invalid: '+authUrl);
out('  Auth bridge policy: DOMAIN + USER_ACCESSING','green');
out('  Auth bridge asks only for Workspace email identity.','green');

out('\n[4/6] Updating centralized backend to verify signed Workspace sessions...','cyan');
const tempBase=fs.mkdtempSync(path.join(os.tmpdir(),'scp-r42-'));
const tempBackend=path.join(tempBase,'backend');copyDir(backendDir,tempBackend);
let authSession=fs.readFileSync(path.join(tempBackend,'AuthSession.gs'),'utf8');
authSession=replaceOnce(authSession,'__SCP_AUTH_SESSION_SECRET__',secret,'Backend auth secret');
fs.writeFileSync(path.join(tempBackend,'AuthSession.gs'),authSession,'utf8');
const upd=runNode(path.join(toolsDir,'update-apps-script-deployment.mjs'),['--script',backend.scriptId,'--deployment',backend.deploymentId,'--description','Seller Communication Portal v4.9.3R4.3 Workspace Login Bridge','--required-access','DOMAIN','--required-execute-as','USER_DEPLOYING','--required-release',release,'--backend-dir',tempBackend]);
const updDiag=parseJsonStdout(upd,'Backend updater');
if(upd.status!==0||!updDiag.ok)stop('Central backend update failed: '+String(updDiag.error||'unknown error'));
const newDeploymentId=String(updDiag.deploymentId||backend.deploymentId);
out('  Data backend verified: DOMAIN + USER_DEPLOYING','green');
out('  Google Sheets / Smart Link records were not touched by deployment.','green');

out('\n[5/6] Deploying Firebase Hosting with signed-login handoff...','cyan');
const firebaseRoot=path.join(tempBase,'firebase');fs.mkdirSync(firebaseRoot,{recursive:true});
copyDir(publicDir,path.join(firebaseRoot,'public'));
fs.copyFileSync(path.join(root,'firebase.json'),path.join(firebaseRoot,'firebase.json'));
fs.copyFileSync(path.join(root,'.firebaserc'),path.join(firebaseRoot,'.firebaserc'));
let front=fs.readFileSync(path.join(firebaseRoot,'public','index.html'),'utf8');
front=replaceOnce(front,'__SCP_AUTH_BRIDGE_URL__',authUrl,'Frontend auth bridge');
if(packagedDeploymentId&&packagedDeploymentId!==newDeploymentId)front=front.split(packagedDeploymentId).join(newDeploymentId);
if(backend.deploymentId&&backend.deploymentId!==newDeploymentId)front=front.split(backend.deploymentId).join(newDeploymentId);
if(front.includes('__SCP_AUTH_BRIDGE_URL__')||front.includes('__SCP_AUTH_SESSION_SECRET__'))stop('Secret/auth placeholders leaked into Firebase source.');
fs.writeFileSync(path.join(firebaseRoot,'public','index.html'),front,'utf8');
const marker='SCP_R4_3_'+Date.now();
fs.writeFileSync(path.join(firebaseRoot,'public','release-v4.9.3-r4.3.json'),JSON.stringify({portal:'seller-communication-portal',release:'4.9.3R4.3',marker,auth:'SIGNED_WORKSPACE_BRIDGE',dataReset:false},null,2),'utf8');
const deploy=firebase(fb,['deploy','--project',projectId,'--only','hosting','--non-interactive'],{inherit:true,cwd:firebaseRoot});
if(deploy.status!==0)stop('Firebase Hosting deploy failed. Backend was updated, but data was not reset. Rerun this R4.2 package only.');
out('  Firebase Hosting release completed.','green');

out('\n[6/6] Production verification...','cyan');
const hostingOk=await verifyHosting(marker);
if(!hostingOk)stop('Hosting returned but exact R4.2 marker was not visible yet. Rerun R4.2 once; do not run older packages.');
writeJson(backendStateFile,{scriptId:backend.scriptId,deploymentId:newDeploymentId,projectId,updatedAt:new Date().toISOString(),mode:'ACCESS_R4_3_SIGNED_BRIDGE'});
fs.mkdirSync(reportDir,{recursive:true});
const report={release:'4.9.3R4.3',status:'COMPLETE',projectId,backendScriptId:backend.scriptId,backendDeploymentId:newDeploymentId,backendAccess:'DOMAIN',backendExecuteAs:'USER_DEPLOYING',authBridgeScriptId:bridgeDiag.scriptId,authBridgeDeploymentId:bridgeDiag.deploymentId,authBridgeAccess:'DOMAIN',authBridgeExecuteAs:'USER_ACCESSING',authScope:'userinfo.email only',googleSheetsReset:false,trackingLinksReset:false,shortLinkRoutesReset:false,setupRun:false,completedAt:new Date().toISOString()};
writeJson(path.join(reportDir,'WORKSPACE-LOGIN-R4.2.json'),report);
try{fs.rmSync(tempBase,{recursive:true,force:true});}catch{}
out('\n===============================================================','green');
out(' ACCESS FIX COMPLETE - SIGNED WORKSPACE LOGIN BRIDGE VERIFIED','green');
out(' Backend data access: centralized / unchanged','green');
out(' User identity: verified by auth-only Workspace bridge','green');
out(' Tracking_Links / Short_Link_Routes: NOT RESET','green');
out('===============================================================','green');
out('\nOpening Workspace sign-in...','cyan');
openUrl(authUrl+'?action=login');
