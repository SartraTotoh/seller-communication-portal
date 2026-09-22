import {migrateGateway} from './gateway-migration.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

function arg(name,fallback=''){const i=process.argv.indexOf(name);return i>=0&&i+1<process.argv.length?process.argv[i+1]:fallback;}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
function normalizeSource(s){return String(s??'').replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trimEnd();}
function hashSource(s){return crypto.createHash('sha256').update(normalizeSource(s),'utf8').digest('hex').slice(0,16);}
function stemOf(name){const leaf=String(name||'').replace(/\\/g,'/').split('/').pop()||'';return leaf.replace(/\.(gs|js|html|json)$/i,'');}
function selectCredential(store){
  if(store?.tokens&&typeof store.tokens==='object'){
    if(store.tokens.default)return store.tokens.default;
    const vals=Object.values(store.tokens).filter(Boolean);
    return vals.find(v=>v?.refresh_token)||vals[0]||null;
  }
  if(store?.token)return {...store.token,client_id:store.oauth2ClientSettings?.clientId,client_secret:store.oauth2ClientSettings?.clientSecret};
  if(store?.access_token||store?.refresh_token)return store;
  return null;
}
async function accessToken(cred){
  if(cred.access_token&&(!cred.expiry_date||Number(cred.expiry_date)>Date.now()+60000))return cred.access_token;
  if(!cred.refresh_token||!cred.client_id)throw new Error('CLASP_OAUTH_TOKEN_UNAVAILABLE');
  const body=new URLSearchParams({client_id:String(cred.client_id),refresh_token:String(cred.refresh_token),grant_type:'refresh_token'});
  if(cred.client_secret)body.set('client_secret',String(cred.client_secret));
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.access_token)throw new Error('CLASP_OAUTH_REFRESH_FAILED_'+res.status);
  return data.access_token;
}
async function request(url,token,method='GET',body=null){
  for(let n=0;n<4;n++){
    const res=await fetch(url,{method,headers:{authorization:`Bearer ${token}`,accept:'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
    const text=await res.text();let data={};try{data=text?JSON.parse(text):{};}catch{}
    if((res.status===429||res.status>=500)&&n<3){await sleep(700*(n+1));continue;}
    return {ok:res.ok,status:res.status,data,text};
  }
  return {ok:false,status:599,data:{},text:''};
}
function manifestFromContent(content,manifestFileName='appsscript'){
  const files=Array.isArray(content?.files)?content.files:[];
  const exact=files.filter(f=>String(f?.name||'')===manifestFileName&&String(f?.type||'').toUpperCase()==='JSON');
  const fallback=files.filter(f=>stemOf(f?.name).toLowerCase()==='appsscript'&&String(f?.type||'').toUpperCase()==='JSON');
  const file=exact[0]||fallback[0];
  if(!file?.source)return {ok:false,error:'MANIFEST_NOT_FOUND'};
  try{return {ok:true,manifest:JSON.parse(file.source),source:file.source,name:String(file.name||manifestFileName)};}
  catch(e){return {ok:false,error:'MANIFEST_JSON_INVALID',detail:String(e?.message||e)};}
}
function policy(manifest){return {access:String(manifest?.webapp?.access||''),executeAs:String(manifest?.webapp?.executeAs||'')};}
function policyOk(p,requiredAccess,requiredExecuteAs){return p.access===requiredAccess&&p.executeAs===requiredExecuteAs;}
async function getContent(scriptId,token,versionNumber=0){
  const suffix=versionNumber?`?versionNumber=${encodeURIComponent(versionNumber)}`:'';
  return request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/content${suffix}`,token);
}
function writableFiles(files){
  return (Array.isArray(files)?files:[]).map(f=>({name:String(f?.name||''),type:String(f?.type||''),source:String(f?.source||'')})).filter(f=>f.name&&f.type);
}
function loadLocalPackage(backendDir){
  const dir=path.resolve(backendDir);
  if(!fs.existsSync(dir)||!fs.statSync(dir).isDirectory())throw new Error('LOCAL_BACKEND_DIR_NOT_FOUND');
  const manifestPath=path.join(dir,'appsscript.json');
  if(!fs.existsSync(manifestPath))throw new Error('LOCAL_MANIFEST_NOT_FOUND');
  const manifest=readJson(manifestPath);
  const codeFiles=[];
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(!entry.isFile())continue;
    const ext=path.extname(entry.name).toLowerCase();
    if(!['.gs','.js','.html'].includes(ext))continue;
    if(entry.name.startsWith('.'))continue;
    const name=path.basename(entry.name,ext);
    const type=ext==='.html'?'HTML':'SERVER_JS';
    codeFiles.push({name,type,source:fs.readFileSync(path.join(dir,entry.name),'utf8'),localFile:entry.name});
  }
  codeFiles.sort((a,b)=>a.name.localeCompare(b.name));
  if(!codeFiles.length)throw new Error('LOCAL_BACKEND_SOURCE_EMPTY');
  return {dir,manifest,codeFiles};
}
function matchingFileIndexes(files,stem){
  const target=String(stem||'').toLowerCase();
  const out=[];
  (Array.isArray(files)?files:[]).forEach((f,i)=>{if(stemOf(f?.name).toLowerCase()===target)out.push(i);});
  return out;
}
function sourceByStem(files,stem){
  const idxs=matchingFileIndexes(files,stem);
  if(idxs.length!==1)return '';
  return String(files[idxs[0]]?.source||'');
}
function attestCodeFiles(files,expectedFiles){
  const details=[];
  for(const e of expectedFiles){
    const idxs=matchingFileIndexes(files,e.name);
    if(idxs.length!==1){
      details.push({name:e.name,ok:false,error:idxs.length?'AMBIGUOUS_FILE':'MISSING_FILE',matches:idxs.map(i=>String(files[i]?.name||''))});
      continue;
    }
    const observed=String(files[idxs[0]]?.source||'');
    const ok=normalizeSource(observed)===normalizeSource(e.source);
    details.push({name:e.name,ok,remoteName:String(files[idxs[0]]?.name||''),expectedHash:hashSource(e.source),observedHash:hashSource(observed),error:ok?'':'SOURCE_HASH_MISMATCH'});
  }
  const failed=details.filter(x=>!x.ok);
  return {ok:failed.length===0,error:failed.length?'PACKAGE_SOURCE_MISMATCH_'+failed.map(x=>x.name).join(','):'',details};
}
function semanticReleaseAttestation(files,requiredRelease){
  const tracker=sourceByStem(files,'TrackerSync');
  const live=sourceByStem(files,'LiveSyncEngine');
  const closeout=sourceByStem(files,'Closeout');
  const rel=String(requiredRelease||'').trim();
  if(!rel)return {ok:true,release:'',markers:[]};
  const seedPos=live.indexOf('ensurePeopleSeedV480ForSetup_(email)');
  const adminPos=live.indexOf('assertAdminUser_(email)');
  const checks=[
    ['TRACKER_RELEASE',tracker.includes(`PORTAL_BACKEND_RELEASE = '${rel}'`)],
    ['CLOSEOUT_RELEASE',closeout.includes(`PORTAL_CLOSEOUT_RELEASE = '${rel}'`)],
    ['SETUP_RELEASE_GUARD',tracker.includes('BACKEND RELEASE MISMATCH')&&tracker.includes('Backend release: <strong>v')],
    ['PEOPLE_SELF_HEAL_ORDER',seedPos>=0&&adminPos>=0&&seedPos<adminPos],
    ['SETUP_TRIGGER_DERIVED',live.includes('function portalSetupTriggerTag_()')&&live.includes('triggeredBy:portalSetupTriggerTag_()')&&live.includes('PORTAL_BACKEND_RELEASE')],
    ['LIVE_SETUP_RELEASE_DERIVED',live.includes("LIVE_SYNC_SETUP_RELEASE', PORTAL_BACKEND_RELEASE")&&live.includes('release:PORTAL_BACKEND_RELEASE')]
  ];
  const failed=checks.filter(([,ok])=>!ok).map(([name])=>name);
  return {ok:failed.length===0,error:failed.length?'VERSION_SOURCE_ATTESTATION_FAILED_'+failed.join(','):'',release:rel,markers:checks.map(([name,ok])=>({name,ok}))};
}
function detectUnknownCoreCollisions(files,expectedFiles,manifestFileName){
  const known=new Set(expectedFiles.map(x=>x.name.toLowerCase()));
  const collisions=[];
  for(const f of Array.isArray(files)?files:[]){
    const stem=stemOf(f?.name).toLowerCase();
    if(known.has(stem)||stem===String(manifestFileName||'appsscript').toLowerCase()||stem==='appsscript')continue;
    const src=String(f?.source||'');
    const tokens=['PORTAL_BACKEND_RELEASE','PORTAL_CLOSEOUT_RELEASE','function setupPortalLiveSync','function doGet(','function doPost(','function portalViewerContext_'];
    const hit=tokens.filter(t=>src.includes(t));
    if(hit.length)collisions.push({name:String(f?.name||''),tokens:hit});
  }
  return {ok:collisions.length===0,collisions};
}
function overlayPackageSource(remoteFiles,expectedFiles,manifestFileName,localManifest,requiredAccess,requiredExecuteAs){
  const patched=writableFiles(remoteFiles);
  const collision=detectUnknownCoreCollisions(patched,expectedFiles,manifestFileName);
  if(!collision.ok)return {ok:false,error:'REMOTE_UNKNOWN_CORE_COLLISION',collision};
  for(const e of expectedFiles){
    const idxs=matchingFileIndexes(patched,e.name);
    if(idxs.length>1)return {ok:false,error:'REMOTE_AMBIGUOUS_SOURCE_FILE_'+e.name,matches:idxs.map(i=>patched[i].name)};
    if(idxs.length===1){patched[idxs[0]].type=e.type;patched[idxs[0]].source=e.source;}
    else patched.push({name:e.name,type:e.type,source:e.source});
  }
  const manifestIdxs=patched.map((f,i)=>({f,i})).filter(x=>String(x.f?.type||'').toUpperCase()==='JSON'&&(String(x.f?.name||'')===manifestFileName||stemOf(x.f?.name).toLowerCase()==='appsscript')).map(x=>x.i);
  if(manifestIdxs.length!==1)return {ok:false,error:manifestIdxs.length?'REMOTE_AMBIGUOUS_MANIFEST':'MANIFEST_NOT_FOUND'};
  let remoteManifest={};
  try{remoteManifest=JSON.parse(String(patched[manifestIdxs[0]].source||'{}'));}catch(e){return {ok:false,error:'MANIFEST_JSON_INVALID',detail:String(e?.message||e)};}
  const merged={...remoteManifest,...localManifest};
  merged.webapp={...(remoteManifest.webapp||{}),...(localManifest.webapp||{}),access:requiredAccess,executeAs:requiredExecuteAs};
  patched[manifestIdxs[0]].source=JSON.stringify(merged,null,2);
  return {ok:true,files:patched,manifest:merged};
}
function stateFromContent(content,expectedFiles,manifestFileName,requiredAccess,requiredExecuteAs,requiredRelease){
  const m=manifestFromContent(content,manifestFileName);
  const p=m.ok?policy(m.manifest):{access:'',executeAs:''};
  const code=attestCodeFiles(content?.files||[],expectedFiles);
  const semantic=semanticReleaseAttestation(content?.files||[],requiredRelease);
  const collision=detectUnknownCoreCollisions(content?.files||[],expectedFiles,manifestFileName);
  return {ok:m.ok&&policyOk(p,requiredAccess,requiredExecuteAs)&&code.ok&&semantic.ok&&collision.ok,collision,manifest:m,policy:p,code,semantic,fileNames:(content?.files||[]).map(f=>String(f?.name||''))};
}
async function waitForHeadState(scriptId,token,expectedFiles,manifestFileName,requiredAccess,requiredExecuteAs,requiredRelease){
  let last={};
  for(let i=0;i<10;i++){
    const r=await getContent(scriptId,token);
    if(r.ok){
      last={status:r.status,...stateFromContent(r.data,expectedFiles,manifestFileName,requiredAccess,requiredExecuteAs,requiredRelease)};
      if(last.ok)return last;
    }else last={status:r.status,error:'CONTENT_GET_FAILED'};
    await sleep(1200+400*i);
  }
  return {ok:false,last};
}
async function selfHealHeadState(scriptId,token,local,manifestFileName,requiredAccess,requiredExecuteAs,requiredRelease){
  const current=await getContent(scriptId,token);
  if(!current.ok)return {ok:false,error:'HEAD_CONTENT_GET_FAILED_'+current.status,last:{status:current.status}};
  // Preserve the exact remote source before any cloud mutation. Failure to save stops deployment.
  const backupDir=path.resolve(local.dir,'..','RECOVERY_REPORT',new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(backupDir,{recursive:true});
  fs.writeFileSync(path.join(backupDir,'remote-source-before.json'),JSON.stringify({scriptId,files:current.data?.files||[]},null,2),'utf8');
  const migration=migrateGateway(current.data?.files||[],local.codeFiles);
  if(migration.changed){
    local.codeFiles.push({...migration.migrated,name:stemOf(migration.migrated.name)});
    fs.writeFileSync(path.join(backupDir,'gateway-migration.json'),JSON.stringify({scriptId,file:migration.migrated.name,handlers:migration.handlers,originalSha256:hashSource((current.data.files||[]).find(f=>f.name===migration.migrated.name).source),migratedSha256:hashSource(migration.migrated.source)},null,2),'utf8');
  }
  const before=stateFromContent(current.data,local.codeFiles,manifestFileName,requiredAccess,requiredExecuteAs,requiredRelease);
  if(before.ok)return {ok:true,mode:'already_ready',before:{policy:before.policy,sourceReady:true},policy:before.policy,attestedFiles:before.code.details.length};
  const sourceDrift=!before.code.ok||!before.semantic.ok;
  const manifestDrift=!before.manifest.ok||!policyOk(before.policy,requiredAccess,requiredExecuteAs);
  const over=overlayPackageSource(current.data?.files||[],local.codeFiles,manifestFileName,local.manifest,requiredAccess,requiredExecuteAs);
  if(!over.ok)return {ok:false,error:over.error,last:{before:{policy:before.policy,codeError:before.code.error,semanticError:before.semantic.error},detail:over}};
  const put=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/content`,token,'PUT',{files:over.files});
  if(!put.ok)return {ok:false,error:'REMOTE_SOURCE_UPDATE_FAILED_'+put.status,last:{before:{policy:before.policy,codeError:before.code.error,semanticError:before.semantic.error},status:put.status,detail:(put.text||'').slice(0,300)}};
  const verified=await waitForHeadState(scriptId,token,local.codeFiles,manifestFileName,requiredAccess,requiredExecuteAs,requiredRelease);
  if(!verified.ok)return {ok:false,error:'REMOTE_SOURCE_READBACK_FAILED',last:{before:{policy:before.policy,codeError:before.code.error,semanticError:before.semantic.error},readback:verified.last}};
  const mode=sourceDrift&&manifestDrift?'updated_remote_source_and_manifest':sourceDrift?'updated_remote_source':'updated_remote_manifest';
  return {ok:true,mode,before:{policy:before.policy,sourceReady:before.code.ok&&before.semantic.ok},policy:verified.policy,attestedFiles:verified.code.details.length};
}
function isLegacyAnyoneAccess(access){return ['ANYONE','ANYONE_ANONYMOUS'].includes(String(access||'').toUpperCase());}
function isDomainAnyoneError(result){const t=String(result?.text||'');return result?.status===400&&/ANYONE access has been disabled by your domain administrator/i.test(t);}
function shouldCreateDomainReplacement(result,previousWebApp){return !!result&&!result.ok&&result.status===400&&(isDomainAnyoneError(result)||isLegacyAnyoneAccess(previousWebApp?.access));}
async function verifyVersionPolicy(scriptId,token,versionNumber,manifestFileName,requiredAccess,requiredExecuteAs){
  const r=await getContent(scriptId,token,versionNumber);
  if(!r.ok)return {ok:false,error:'VERSION_CONTENT_GET_FAILED_'+r.status};
  const m=manifestFromContent(r.data,manifestFileName);
  if(!m.ok)return {ok:false,error:m.error};
  const p=policy(m.manifest);
  return {ok:policyOk(p,requiredAccess,requiredExecuteAs),policy:p,error:policyOk(p,requiredAccess,requiredExecuteAs)?'':'VERSION_MANIFEST_POLICY_MISMATCH'};
}
async function verifyVersionAttestation(scriptId,token,versionNumber,requiredRelease,expectedFiles){
  const r=await getContent(scriptId,token,versionNumber);
  if(!r.ok)return {ok:false,error:'VERSION_ATTEST_CONTENT_GET_FAILED_'+r.status};
  const files=Array.isArray(r.data?.files)?r.data.files:[];
  const packageCheck=attestCodeFiles(files,expectedFiles);
  const semantic=semanticReleaseAttestation(files,requiredRelease);
  const ok=packageCheck.ok&&semantic.ok;
  return {ok,error:ok?'':(packageCheck.error||semantic.error||'VERSION_SOURCE_ATTESTATION_FAILED'),release:String(requiredRelease||''),packageFiles:packageCheck.details,markers:semantic.markers,fileNames:files.map(f=>String(f?.name||''))};
}
function webAppConfig(deployment){
  for(const e of deployment?.entryPoints||[]){if(e?.entryPointType==='WEB_APP'&&e?.webApp?.entryPointConfig)return {url:String(e.webApp.url||''),...e.webApp.entryPointConfig};}
  return {url:'',access:'',executeAs:''};
}
async function getDeployment(scriptId,deploymentId,token){return request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,token);}
async function verifyDeployment(scriptId,deploymentId,token,versionNumber,requiredAccess,requiredExecuteAs){
  for(let i=0;i<6;i++){
    const r=await getDeployment(scriptId,deploymentId,token);
    if(r.ok){
      const actual=Number(r.data?.deploymentConfig?.versionNumber||0);const cfg=webAppConfig(r.data);
      if(String(r.data?.deploymentId||'')===deploymentId&&actual===versionNumber&&cfg.access===requiredAccess&&cfg.executeAs===requiredExecuteAs)return {ok:true,data:r.data,webApp:cfg};
    }
    await sleep(1000+500*i);
  }
  return {ok:false};
}

const backendDir=path.resolve(arg('--backend-dir',process.cwd()));
const requiredRelease=arg('--required-release','4.9.3');
let local;
try{local=loadLocalPackage(backendDir);}catch(e){console.log(JSON.stringify({ok:false,error:String(e?.message||e),backendDir}));process.exit(65);}

if(process.argv.includes('--self-test')){
  const semantic=semanticReleaseAttestation(local.codeFiles,requiredRelease);
  const fake=local.codeFiles.map((f,i)=>({name:i%2===0?`backend/${f.name}.gs`:f.name,type:f.type,source:f.source}));
  fake.push({name:'appsscript',type:'JSON',source:JSON.stringify(local.manifest)});
  const packageCheck=attestCodeFiles(fake,local.codeFiles);
  const stale=fake.map(f=>stemOf(f.name).toLowerCase()==='appsscript'?{...f,source:JSON.stringify({...local.manifest,webapp:{...(local.manifest.webapp||{}),access:'ANYONE_ANONYMOUS',executeAs:'USER_DEPLOYING'}})}:(String(f.type).toUpperCase()==='SERVER_JS'?{...f,source:'// stale source'}:f));
  const over=overlayPackageSource(stale,local.codeFiles,'appsscript',local.manifest,'DOMAIN','USER_ACCESSING');
  const overState=over.ok?stateFromContent({files:over.files},local.codeFiles,'appsscript','DOMAIN','USER_ACCESSING',requiredRelease):{ok:false};
  const ok=semantic.ok&&packageCheck.ok&&over.ok&&overState.ok;
  console.log(JSON.stringify({ok,requiredRelease,semantic,packageCheck:{ok:packageCheck.ok,count:packageCheck.details.length},overlay:{ok:over.ok,stateOk:overState.ok}}));
  process.exit(ok?0:66);
}

const scriptId=arg('--script');
const deploymentId=arg('--deployment');
const description=arg('--description','Seller Communication Portal v4.9.3 Triple Source Campaign 360');
const requiredAccess=arg('--required-access','DOMAIN');
const requiredExecuteAs=arg('--required-execute-as','USER_ACCESSING');
if(!scriptId||!deploymentId){console.log(JSON.stringify({ok:false,error:'ARGS_REQUIRED'}));process.exit(64);}
const authFile=process.env.clasp_config_auth||process.env.CLASP_CONFIG_AUTH||path.join(process.env.USERPROFILE||os.homedir(),'.clasprc.json');

try{
  const localSemantic=semanticReleaseAttestation(local.codeFiles,requiredRelease);
  if(!localSemantic.ok){console.log(JSON.stringify({ok:false,error:'LOCAL_PACKAGE_ATTESTATION_FAILED',requiredRelease,attestation:localSemantic}));process.exit(67);}
  if(!fs.existsSync(authFile))throw new Error('CLASP_AUTH_FILE_NOT_FOUND');
  const cred=selectCredential(readJson(authFile));if(!cred)throw new Error('CLASP_CREDENTIAL_NOT_FOUND');
  const token=await accessToken(cred);

  const before=await getDeployment(scriptId,deploymentId,token);
  if(!before.ok)throw new Error('DEPLOYMENT_GET_FAILED_'+before.status);
  if(String(before.data?.deploymentId||'')!==deploymentId)throw new Error('DEPLOYMENT_ID_MISMATCH');
  const previousWebApp=webAppConfig(before.data);
  const manifestFileName=String(before.data?.deploymentConfig?.manifestFileName||'appsscript');

  // v4.9.3: Treat the package backend as the source of truth for known Portal files.
  // Preserve unknown remote files, overlay every bundled .gs/.html file, merge the local
  // manifest, enforce DOMAIN + USER_ACCESSING, and require Google read-back BEFORE
  // creating an immutable version. This closes the gap where clasp reported success
  // but Google HEAD still contained an older backend release.
  const head=await selfHealHeadState(scriptId,token,local,manifestFileName,requiredAccess,requiredExecuteAs,requiredRelease);
  if(!head.ok){
    console.log(JSON.stringify({ok:false,error:'REMOTE_SOURCE_POLICY_NOT_READY',selfHealError:head.error||'',required:{access:requiredAccess,executeAs:requiredExecuteAs,release:requiredRelease},observed:head.last||null,previousWebApp}));
    process.exit(72);
  }

  const v=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/versions`,token,'POST',{description});
  if(!v.ok||!Number(v.data?.versionNumber))throw new Error('VERSION_CREATE_FAILED_'+v.status+'_'+(v.text||'').slice(0,220));
  const versionNumber=Number(v.data.versionNumber);

  const vp=await verifyVersionPolicy(scriptId,token,versionNumber,manifestFileName,requiredAccess,requiredExecuteAs);
  if(!vp.ok){console.log(JSON.stringify({ok:false,error:vp.error||'VERSION_POLICY_VERIFY_FAILED',versionNumber,required:{access:requiredAccess,executeAs:requiredExecuteAs},observed:vp.policy||null}));process.exit(73);}
  const va=await verifyVersionAttestation(scriptId,token,versionNumber,requiredRelease,local.codeFiles);
  if(!va.ok){console.log(JSON.stringify({ok:false,error:va.error||'VERSION_SOURCE_ATTESTATION_FAILED',versionNumber,requiredRelease,attestation:va}));process.exit(74);}

  const body={deploymentConfig:{scriptId,versionNumber,manifestFileName,description}};
  let u=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,token,'PUT',body);
  if(!u.ok&&shouldCreateDomainReplacement(u,previousWebApp)){
    for(const wait of [2500,5000]){await sleep(wait);u=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,token,'PUT',body);if(u.ok)break;if(!shouldCreateDomainReplacement(u,previousWebApp))break;}
    if(!u.ok&&shouldCreateDomainReplacement(u,previousWebApp)){
      const createBody={versionNumber,manifestFileName,description:description+' - DOMAIN replacement'};
      const created=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments`,token,'POST',createBody);
      const replacementId=String(created.data?.deploymentId||'');
      if(!created.ok||!replacementId)throw new Error('DOMAIN_REPLACEMENT_CREATE_FAILED_'+created.status+'_'+(created.text||'').slice(0,240));
      const verified=await verifyDeployment(scriptId,replacementId,token,versionNumber,requiredAccess,requiredExecuteAs);
      if(!verified.ok)throw new Error('DOMAIN_REPLACEMENT_VERIFY_FAILED');
      console.log(JSON.stringify({ok:true,mode:'created_domain_replacement',reason:'LEGACY_ANYONE_BLOCKED_BY_DOMAIN_POLICY',scriptId,deploymentId:replacementId,previousDeploymentId:deploymentId,versionNumber,description,webAppUrl:verified.webApp.url||'',access:verified.webApp.access,executeAs:verified.webApp.executeAs,previousWebApp,oldDeploymentPreserved:true,sourceAttested:true,attestedRelease:requiredRelease,attestedFiles:va.packageFiles.length,manifestSelfHeal:head.mode||'unknown',updateTime:verified.data?.updateTime||''}));
      process.exit(0);
    }
  }
  if(!u.ok)throw new Error('DEPLOYMENT_UPDATE_FAILED_'+u.status+'_'+(u.text||'').slice(0,260));

  const verified=await verifyDeployment(scriptId,deploymentId,token,versionNumber,requiredAccess,requiredExecuteAs);
  if(!verified.ok)throw new Error('DEPLOYMENT_VERIFY_FAILED');
  console.log(JSON.stringify({ok:true,mode:'updated_existing',scriptId,deploymentId,previousDeploymentId:deploymentId,versionNumber,description,webAppUrl:verified.webApp.url||'',access:verified.webApp.access,executeAs:verified.webApp.executeAs,previousWebApp,oldDeploymentPreserved:true,sourceAttested:true,attestedRelease:requiredRelease,attestedFiles:va.packageFiles.length,manifestSelfHeal:head.mode||'unknown',updateTime:verified.data?.updateTime||''}));
}catch(e){console.log(JSON.stringify({ok:false,error:String(e?.message||e)}));process.exit(70);}
