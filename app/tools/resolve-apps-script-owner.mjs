import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function arg(name, fallback='') {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function uniq(values) {
  const out=[]; const seen=new Set();
  for (const raw of values || []) {
    const v=String(raw||'').trim();
    if (!v || v.startsWith('AKfy') || seen.has(v)) continue;
    seen.add(v); out.push(v);
  }
  return out;
}
function readJson(file) {
  const text=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
  return JSON.parse(text);
}
function selectCredential(store) {
  if (store?.tokens && typeof store.tokens === 'object') {
    if (store.tokens.default) return store.tokens.default;
    const vals=Object.values(store.tokens).filter(Boolean);
    if (vals.length === 1) return vals[0];
    const withRefresh=vals.find(v=>v?.refresh_token);
    if (withRefresh) return withRefresh;
    if (vals.length) return vals[0];
  }
  if (store?.token) {
    return {
      ...store.token,
      client_id: store.oauth2ClientSettings?.clientId,
      client_secret: store.oauth2ClientSettings?.clientSecret,
    };
  }
  if (store?.access_token || store?.refresh_token) return store;
  return null;
}
async function refreshAccessToken(cred) {
  const now=Date.now();
  if (cred.access_token && (!cred.expiry_date || Number(cred.expiry_date) > now + 60000)) return cred.access_token;
  if (!cred.refresh_token || !cred.client_id) {
    if (cred.access_token) return cred.access_token;
    throw new Error('CLASP_OAUTH_TOKEN_UNAVAILABLE');
  }
  const body=new URLSearchParams({
    client_id:String(cred.client_id),
    refresh_token:String(cred.refresh_token),
    grant_type:'refresh_token',
  });
  if (cred.client_secret) body.set('client_secret',String(cred.client_secret));
  const res=await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body,
  });
  const data=await res.json().catch(()=>({}));
  if (!res.ok || !data.access_token) throw new Error('CLASP_OAUTH_REFRESH_FAILED_'+res.status);
  return data.access_token;
}
async function apiJson(url, token) {
  for (let attempt=0; attempt<4; attempt++) {
    const res=await fetch(url,{headers:{authorization:`Bearer ${token}`,accept:'application/json'}});
    const text=await res.text();
    let data={}; try { data=text?JSON.parse(text):{}; } catch {}
    if ((res.status===429 || res.status>=500) && attempt<3) {
      await new Promise(r=>setTimeout(r,500*(attempt+1)));
      continue;
    }
    return {ok:res.ok,status:res.status,data,text};
  }
  return {ok:false,status:599,data:{},text:''};
}
async function userInfo(token) {
  const r=await apiJson('https://www.googleapis.com/oauth2/v3/userinfo',token);
  return r.ok ? String(r.data?.email||'') : '';
}
async function driveScriptProjects(token) {
  const files=[];
  const q="mimeType='application/vnd.google-apps.script' and trashed=false";
  let pageToken='';
  let fallback=false;
  for (let page=0; page<50; page++) {
    const u=new URL('https://www.googleapis.com/drive/v3/files');
    u.searchParams.set('q',q);
    u.searchParams.set('spaces','drive');
    u.searchParams.set('pageSize','1000');
    u.searchParams.set('fields','nextPageToken,files(id,name,modifiedTime,driveId,capabilities(canEdit))');
    u.searchParams.set('includeItemsFromAllDrives','true');
    u.searchParams.set('supportsAllDrives','true');
    u.searchParams.set('corpora',fallback?'user':'allDrives');
    if (pageToken) u.searchParams.set('pageToken',pageToken);
    let r=await apiJson(u.toString(),token);
    if (!r.ok && !fallback && (r.status===400 || r.status===403)) {
      fallback=true; pageToken=''; page=-1; files.length=0; continue;
    }
    if (!r.ok) throw new Error('DRIVE_LIST_FAILED_'+r.status);
    for (const f of r.data?.files||[]) {
      // Read-only projects cannot be pushed, but retain them as diagnostic candidates.
      files.push({id:String(f.id||''),name:String(f.name||''),canEdit:f.capabilities?.canEdit!==false});
    }
    pageToken=String(r.data?.nextPageToken||'');
    if (!pageToken) break;
  }
  return files;
}
async function hasDeployment(scriptId,deploymentId,token) {
  let pageToken='';
  for (let page=0; page<100; page++) {
    const u=new URL(`https://script.googleapis.com/v1/projects/${encodeURIComponent(scriptId)}/deployments`);
    u.searchParams.set('pageSize','50');
    if (pageToken) u.searchParams.set('pageToken',pageToken);
    const r=await apiJson(u.toString(),token);
    if (r.status===403 || r.status===404) return {match:false,accessible:false};
    if (!r.ok) return {match:false,accessible:false,error:`SCRIPT_DEPLOYMENTS_${r.status}`};
    for (const d of r.data?.deployments||[]) {
      if (String(d.deploymentId||'')===deploymentId) {
        return {match:true,accessible:true,deployment:d};
      }
    }
    pageToken=String(r.data?.nextPageToken||'');
    if (!pageToken) break;
  }
  return {match:false,accessible:true};
}

const deploymentId=arg('--deployment');
const candidateFile=arg('--candidates');
if (!deploymentId || !candidateFile) {
  console.log(JSON.stringify({ok:false,error:'ARGS_REQUIRED'}));
  process.exit(64);
}
let input={};
try { input=readJson(candidateFile); } catch { input={candidates:[]}; }
const authFile=process.env.clasp_config_auth || process.env.CLASP_CONFIG_AUTH || path.join(process.env.USERPROFILE||os.homedir(),'.clasprc.json');
if (!fs.existsSync(authFile)) {
  console.log(JSON.stringify({ok:false,error:'CLASP_AUTH_FILE_NOT_FOUND'}));
  process.exit(65);
}
try {
  const store=readJson(authFile);
  const cred=selectCredential(store);
  if (!cred) throw new Error('CLASP_CREDENTIAL_NOT_FOUND');
  const token=await refreshAccessToken(cred);
  const email=await userInfo(token);
  let drive=[]; let driveError='';
  try { drive=await driveScriptProjects(token); } catch (e) { driveError=String(e?.message||e); }
  const names=new Map(drive.map(f=>[f.id,f.name]));
  const canEdit=new Map(drive.map(f=>[f.id,!!f.canEdit]));
  const candidates=uniq([...(input.candidates||[]),...drive.map(f=>f.id)]);
  const hits=[];
  let accessibleCount=0;
  let cursor=0;
  const workerCount=Math.max(1,Math.min(8,candidates.length));
  async function worker() {
    while (true) {
      const i=cursor++;
      if (i>=candidates.length) return;
      const sid=candidates[i];
      const r=await hasDeployment(sid,deploymentId,token);
      if (r.accessible) accessibleCount++;
      if (r.match) hits.push({scriptId:sid,name:names.get(sid)||'',canEdit:canEdit.has(sid)?canEdit.get(sid):true});
    }
  }
  await Promise.all(Array.from({length:workerCount},()=>worker()));
  if (hits.length===1) {
    console.log(JSON.stringify({ok:true,scriptId:hits[0].scriptId,name:hits[0].name,email,candidateCount:candidates.length,driveCandidateCount:drive.length,accessibleCount,canEdit:hits[0].canEdit,driveError}));
    process.exit(hits[0].canEdit ? 0 : 4);
  }
  if (hits.length>1) {
    console.log(JSON.stringify({ok:false,error:'MULTIPLE_DEPLOYMENT_OWNERS',email,hits,candidateCount:candidates.length,driveCandidateCount:drive.length,accessibleCount,driveError}));
    process.exit(3);
  }
  console.log(JSON.stringify({ok:false,error:'DEPLOYMENT_OWNER_NOT_VISIBLE',email,candidateCount:candidates.length,driveCandidateCount:drive.length,accessibleCount,driveError}));
  process.exit(2);
} catch (e) {
  console.log(JSON.stringify({ok:false,error:String(e?.message||e)}));
  process.exit(70);
}
