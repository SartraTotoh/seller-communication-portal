import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

function arg(name,fallback=''){const i=process.argv.indexOf(name);return i>=0&&i+1<process.argv.length?process.argv[i+1]:fallback;}
function readJson(file){return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
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
function webAppConfig(deployment){
  for(const e of deployment?.entryPoints||[]){if(e?.entryPointType==='WEB_APP'&&e?.webApp?.entryPointConfig)return {url:String(e.webApp.url||''),...e.webApp.entryPointConfig};}
  return {url:'',access:'',executeAs:''};
}
async function verifyDeployment(scriptId,deploymentId,token,versionNumber){
  for(let i=0;i<8;i++){
    const r=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,token);
    if(r.ok){
      const actual=Number(r.data?.deploymentConfig?.versionNumber||0),cfg=webAppConfig(r.data);
      if(actual===versionNumber&&cfg.access==='DOMAIN'&&cfg.executeAs==='USER_ACCESSING'&&cfg.url)return {ok:true,data:r.data,cfg};
    }
    await sleep(900+300*i);
  }
  return {ok:false};
}
function loadBridgeFiles(dir,secret){
  const manifest=readJson(path.join(dir,'appsscript.json'));
  const code=fs.readFileSync(path.join(dir,'Code.gs'),'utf8').replaceAll('__SCP_AUTH_SESSION_SECRET__',secret);
  if(!secret||code.includes('__SCP_AUTH_SESSION_SECRET__'))throw new Error('AUTH_SECRET_INJECTION_FAILED');
  return [
    {name:'Code',type:'SERVER_JS',source:code},
    {name:'appsscript',type:'JSON',source:JSON.stringify(manifest,null,2)}
  ];
}

const bridgeDir=path.resolve(arg('--bridge-dir'));
const stateFile=path.resolve(arg('--state'));
const title=arg('--title','Seller Communication Portal Workspace Auth Bridge');
if(!bridgeDir||!stateFile){console.log(JSON.stringify({ok:false,error:'ARGS_REQUIRED'}));process.exit(64);}
const authFile=process.env.clasp_config_auth||process.env.CLASP_CONFIG_AUTH||path.join(process.env.USERPROFILE||os.homedir(),'.clasprc.json');
try{
  if(!fs.existsSync(authFile))throw new Error('CLASP_AUTH_FILE_NOT_FOUND');
  const cred=selectCredential(readJson(authFile));if(!cred)throw new Error('CLASP_CREDENTIAL_NOT_FOUND');
  const token=await accessToken(cred);
  let state={};try{if(fs.existsSync(stateFile))state=readJson(stateFile);}catch{}
  let secret=String(state.secret||'');if(secret.length<32)secret=crypto.randomBytes(32).toString('base64url');
  let scriptId=String(state.scriptId||''),deploymentId=String(state.deploymentId||'');
  if(scriptId){
    const probe=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/content`,token);
    if(!probe.ok){scriptId='';deploymentId='';}
  }
  if(!scriptId){
    const created=await request('https://script.googleapis.com/v1/projects',token,'POST',{title});
    if(!created.ok||!created.data?.scriptId)throw new Error('AUTH_BRIDGE_PROJECT_CREATE_FAILED_'+created.status+'_'+(created.text||'').slice(0,220));
    scriptId=String(created.data.scriptId);deploymentId='';
  }
  const files=loadBridgeFiles(bridgeDir,secret);
  const put=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/content`,token,'PUT',{files});
  if(!put.ok)throw new Error('AUTH_BRIDGE_SOURCE_UPDATE_FAILED_'+put.status+'_'+(put.text||'').slice(0,220));
  const v=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/versions`,token,'POST',{description:'Seller Communication Portal v4.9.3R4.4 Workspace login bridge'});
  if(!v.ok||!Number(v.data?.versionNumber))throw new Error('AUTH_BRIDGE_VERSION_CREATE_FAILED_'+v.status+'_'+(v.text||'').slice(0,220));
  const versionNumber=Number(v.data.versionNumber);
  const updateBody={deploymentConfig:{scriptId,versionNumber,manifestFileName:'appsscript',description:'Seller Communication Portal v4.9.3R4.4 Workspace Auth Bridge'}};
  const createBody={versionNumber,manifestFileName:'appsscript',description:'Seller Communication Portal v4.9.3R4.4 Workspace Auth Bridge'};
  let deploy;
  if(deploymentId){
    deploy=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments/${encodeURIComponent(deploymentId)}`,token,'PUT',updateBody);
    if(!deploy.ok)deploymentId='';
  }
  if(!deploymentId){
    deploy=await request(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments`,token,'POST',createBody);
    deploymentId=String(deploy.data?.deploymentId||'');
  }
  if(!deploy?.ok||!deploymentId)throw new Error('AUTH_BRIDGE_DEPLOY_FAILED_'+String(deploy?.status||'')+'_'+String(deploy?.text||'').slice(0,220));
  const verified=await verifyDeployment(scriptId,deploymentId,token,versionNumber);
  if(!verified.ok)throw new Error('AUTH_BRIDGE_VERIFY_FAILED');
  const url=String(verified.cfg.url||'');
  if(!/^https:\/\/script\.google\.com\/(?:a\/macros\/shopee\.com\/|macros\/)s\/AKfy[A-Za-z0-9_-]+\/exec$/i.test(url))throw new Error('AUTH_BRIDGE_URL_UNEXPECTED_'+url);
  fs.mkdirSync(path.dirname(stateFile),{recursive:true});
  fs.writeFileSync(stateFile,JSON.stringify({scriptId,deploymentId,secret,url,versionNumber,updatedAt:new Date().toISOString()},null,2),'utf8');
  console.log(JSON.stringify({ok:true,scriptId,deploymentId,url,versionNumber,access:verified.cfg.access,executeAs:verified.cfg.executeAs}));
}catch(e){console.log(JSON.stringify({ok:false,error:String(e?.message||e)}));process.exit(70);}
