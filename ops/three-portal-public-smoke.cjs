/**
 * Strictly unauthenticated, read-only production smoke probe.
 * Never follows private links, sends credentials, or logs response bodies.
 * Firebase public assets only; this is not an authenticated acceptance test.
 */
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const hosts=Object.freeze([
  {system:'COMMS_PRIMARY',origin:'https://shp-comms.web.app',kind:'comms'},
  {system:'COMMS_SECONDARY',origin:'https://seller-communication-portal.web.app',kind:'comms'},
  {system:'SENTIMENT',origin:'https://seller-sentiment-admin.web.app',kind:'sentiment'},
  {system:'TEAM_TASK',origin:'https://seller-edu.web.app',kind:'team-task'}
]);
const routes={
  comms:['/','/request','/request/newrequest','/request/massrequest','/published','/app.js','/adapter.mjs'],
  sentiment:['/','/runtime-config.js'],
  'team-task':['/']
};
const MAX_BYTES=2*1024*1024;
function inspect(body,kind,path){
  const text=String(body||'');
  if(path!== '/') return {bytes:Buffer.byteLength(text)};
  if(kind==='sentiment') return {markers:{
    cfgTabLine:text.includes('cfgTabLine'),
    cfgContentCollector:text.includes('cfgContentCollector'),
    cfgContentModules:text.includes('cfgContentModules'),
    facebookSource:text.includes('Facebook Source'),
    lineOfficialAccount:text.includes('LINE Official Account')
  }};
  return {markers:{indexHtml:/<html[\s>]/i.test(text),scriptTag:/<script\b/i.test(text)}};
}
async function probe(fetcher=fetch){
 const out=[];
 for(const h of hosts)for(const path of routes[h.kind]){
  const url=h.origin+path;
  try{
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
   let response;
   try{response=await fetcher(url,{method:'GET',redirect:'manual',signal:ctrl.signal,
     headers:{Accept:'text/html,application/javascript,*/*;q=0.8', 'Cache-Control':'no-cache'}})}
   finally{clearTimeout(timer)}
   const originalType=response.headers.get('content-type')||'';
   let payload='';
   if(response.status===200&&
      (/html|javascript|json|text\/plain/i.test(originalType)||path==='/')){
     const length=Number(response.headers.get('content-length')||0);
     if(length>MAX_BYTES){out.push({system:h.system,path,status:200,type:originalType,large:true});continue;}
     payload=await response.text();
     if(Buffer.byteLength(payload)>MAX_BYTES){out.push({system:h.system,path,status:200,type:originalType,large:true});continue;}
   }
   out.push({system:h.system,path,status:response.status,
      type:originalType.slice(0,70),
      sha256:payload?createHash('sha256').update(payload).digest('hex').slice(0,16):null,
      ...inspect(payload,h.kind,path)});
  }catch(e){
   out.push({system:h.system,path,status:0,error:/abort/i.test(String(e?.name))?'TIMEOUT':'NETWORK_FAILURE'});
  }
 }
 return out;
}
function summarize(rows){
 const systems=[...new Set(rows.map(r=>r.system))];
 return systems.map(name=>{
  const group=rows.filter(r=>r.system===name);
  const root=group.find(x=>x.path==='/');
  const failed=group.filter(x=>x.status!==200);
  return {system:name,publicRootHTTP:root?.status||0,
    routesOk:group.filter(x=>x.status===200).length,
    routesProbed:group.length,
    failedPaths:failed.map(x=>x.path),
    markers:root?.markers||{},
    note:'PUBLIC_ONLY_NOT_AUTHENTICATED_UAT'};
 });
}
if(require.main===module){
 probe().then(rows=>{
  // Static, public path names only. No body, headers with secrets, or query strings.
  for(const result of rows)process.stdout.write(JSON.stringify(result)+'\n');
  process.stdout.write('SYSTEM_SUMMARY '+JSON.stringify(summarize(rows))+'\n');
 }).catch(err=>{process.stderr.write('PROBE_ERROR '+String(err?.name||'UNKNOWN')+'\n');process.exitCode=1;});
}
module.exports={hosts,routes,inspect,probe,summarize};
