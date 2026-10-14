/**
 * No-credential health probe for the already-public Cloudflare endpoints.
 * Exposes only HTTP status and explicit health fields, never response bodies.
 */
const targets=[
 {system:'TEAM_TASK',url:'https://seller-team-tasks.sellereducation-th.workers.dev/api/health'},
 {system:'SENTIMENT',url:'https://seller-sentiment-admin.sellereducation-th.workers.dev/api/health'}
];
async function health(fetcher=fetch){
 const results=[];
 for(const t of targets){
  try{
   const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
   let res;
   try{res=await fetcher(t.url,{method:'GET',redirect:'manual',signal:ctrl.signal,headers:{Accept:'application/json'}})}
   finally{clearTimeout(timer)}
   const obj=res.status===200&&/json/i.test(res.headers.get('content-type')||'')
       ? await res.json():{};
   results.push({system:t.system,path:'/api/health',http:res.status,
     ok:obj?.ok===true,status:typeof obj?.status==='string'?obj.status.slice(0,65):null,
     latestSuccessfulSyncAt:typeof obj?.latestSuccessfulSyncAt==='string'?obj.latestSuccessfulSyncAt:null,
     latestRunSource:typeof obj?.latestRun?.source==='string'?obj.latestRun.source.slice(0,55):null,
     note:'PUBLIC_HEALTH_ONLY_NOT_AUTHENTICATED_UAT'});
  }catch(e){results.push({system:t.system,path:'/api/health',http:0,
   status:/abort/i.test(String(e?.name))?'TIMEOUT':'NETWORK_FAILURE'})}
 }
 return results;
}
if(require.main===module)health().then(rows=>rows.forEach(x=>process.stdout.write('WORKER_HEALTH '+JSON.stringify(x)+'\n')))
 .catch(e=>{process.stderr.write('HEALTH_PROBE_FAILED '+String(e?.name||'ERROR')+'\n');process.exitCode=1});
module.exports={targets,health};
