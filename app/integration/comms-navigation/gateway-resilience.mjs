/**
 * Resilient read gateway for Seller Comms (integration-ready contract).
 * This module intentionally performs NO window.postMessage, iframe embedding,
 * Google Apps Script HtmlService RPC, token transfer in URLs or DB writes.
 *
 * Scope cache by verified SERVER-SIDE principal+role+filters. A browser-supplied
 * viewer key is never an authentication mechanism. A 401/403 must fail closed
 * rather than serve previously cached potentially unauthorized records.
 *
 * loadLastGood/storeLastGood must be injected from authenticated server storage.
 */
export class GatewayUnavailableError extends Error {
  constructor(code='GATEWAY_UNAVAILABLE') {
    super(code);
    this.name='GatewayUnavailableError';
    this.code=code;
  }
}
function safeScope(value) {
  const s=String(value || '');
  if (!/^[A-Za-z0-9_.:-]{2,160}$/.test(s)) throw new Error('VERIFIED_VIEWER_SCOPE_REQUIRED');
  return s;
}
function codeOf(err) {
  if (err?.status===401||err?.status===403) return 'ACCESS_DENIED';
  if (err?.code==='TIMEOUT'||/timed out/i.test(String(err?.message||''))) return 'GATEWAY_TIMEOUT';
  return 'GATEWAY_UNAVAILABLE';
}
function validResult(data) {
  if (!data || !Array.isArray(data.requests) ||
      !Number.isSafeInteger(Number(data.total)) || Number(data.total)<0) {
    throw new GatewayUnavailableError('INVALID_GATEWAY_RESPONSE');
  }
  if (data.requests.length > Number(data.total)) throw new GatewayUnavailableError('INVALID_GATEWAY_COUNT');
  return data;
}
export function createResilientGateway({
  fetchRequests, fetchMeta, loadLastGood, storeLastGood,
  now=()=>Date.now(), failureCooldownMs=60000
}={}) {
  for (const [k,v] of Object.entries({fetchRequests,loadLastGood,storeLastGood})) {
    if(typeof v!=='function')throw new Error('MISSING_DEPENDENCY_'+k);
  }
  const pending=new Map(),cooldown=new Map();
  async function getRequests({verifiedViewerScope,cursor='',limit=100}={}) {
    const scope=safeScope(verifiedViewerScope);
    const pageSize=Number(limit);
    if(!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new Error('INVALID_PAGE_SIZE');
    if (typeof cursor!=='string'||cursor.length>160)throw new Error('INVALID_CURSOR');
    const key=scope+'|'+cursor+'|'+pageSize;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{
      const prior=await loadLastGood(key);
      if (cooldown.get(key)>now()&&prior) {
        return {...prior,mode:'stale',errorCode:'RETRY_BACKOFF',lastCheckedAt:new Date(now()).toISOString()};
      }
      try {
        const latest=validResult(await fetchRequests({verifiedViewerScope:scope,cursor,limit:pageSize}));
        if (prior && Number(prior.total)>0 && latest.total===0) {
          throw new GatewayUnavailableError('SUSPICIOUS_ZERO_COUNT');
        }
        const result={
          requests:latest.requests,
          total:Number(latest.total),
          nextCursor:latest.nextCursor||null,
          mode:'live',
          lastSuccessfulSyncAt:latest.lastSuccessfulSyncAt||new Date(now()).toISOString(),
          lastCheckedAt:new Date(now()).toISOString()
        };
        await storeLastGood(key,result);
        cooldown.delete(key);
        return result;
      }catch(err){
        const status=Number(err?.status);
        if (status===401||status===403) {
          cooldown.delete(key);
          throw new GatewayUnavailableError('ACCESS_DENIED');
        }
        cooldown.set(key,now()+failureCooldownMs);
        if(prior && Array.isArray(prior.requests)) {
          return {...prior,mode:'stale',errorCode:codeOf(err),lastCheckedAt:new Date(now()).toISOString()};
        }
        throw new GatewayUnavailableError(codeOf(err));
      }
    })();
    pending.set(key,task);
    try{return await task}finally{pending.delete(key)}
  }
  async function getMeta({verifiedViewerScope}={}) {
    safeScope(verifiedViewerScope);
    if(typeof fetchMeta!=='function')return {ok:false,warning:'METADATA_NOT_CONFIGURED'};
    try {
      return {ok:true,data:await fetchMeta({verifiedViewerScope})};
    }catch(err){
      if(err?.status===401||err?.status===403)throw new GatewayUnavailableError('ACCESS_DENIED');
      // Metadata timeout must never prevent retrieving Requests.
      return {ok:false,warning:codeOf(err)};
    }
  }
  return Object.freeze({getRequests,getMeta});
}
