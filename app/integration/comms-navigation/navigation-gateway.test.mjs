import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalPath,resolveRoute,createRouteController} from './route-contract.mjs';
import {createResilientGateway} from './gateway-resilience.mjs';

function browserAt(start='/') {
  const location={pathname:start};
  const updates=[],listeners=new Map(),views=[];
  const history={
    pushState(_s,_t,path){location.pathname=path;updates.push('push:'+path)},
    replaceState(_s,_t,path){location.pathname=path;updates.push('replace:'+path)}
  };
  const eventTarget={
    addEventListener(name,fn){listeners.set(name,fn)},
    removeEventListener(name){listeners.delete(name)},
    fire(name){listeners.get(name)?.()}
  };
  return {location,history,eventTarget,views,updates};
}
function routerAt(path,allowLeave=()=>true) {
  const b=browserAt(path);
  const router=createRouteController({...b,canLeave:allowLeave,render:x=>b.views.push(x)});
  router.start();return {router,...b};
}

test('routes resolve exact requested real paths',()=>{
  const n=resolveRoute('/request/newrequest');
  const m=resolveRoute('/request/massrequest');
  assert.deepEqual([n.page,n.level,n.parent],['newrequest',3,'/request']);
  assert.deepEqual([m.page,m.level,m.parent],['massrequest',3,'/request']);
  assert.equal(resolveRoute('/').level,1);
  assert.equal(resolveRoute('/published/articles').page,'published-articles');
});
test('L2-L5 have explicit parent navigation after direct deep link',()=>{
  const levels=[
    ['/request',2,'/'],['/request/newrequest',3,'/request'],
    ['/request/detail/REQ_123/edit',4,'/request/detail/REQ_123'],
    ['/request/detail/REQ_123/review',5,'/request/detail/REQ_123/edit']
  ];
  for(const [path,level,parent]of levels) {
    const b=routerAt(path);
    assert.equal(b.views[0].level,level);
    assert.equal(b.views[0].backHref,parent);
    assert.equal(b.views[0].showBack,true);
    assert.equal(b.router.back(),true);
    assert.equal(b.location.pathname,parent);
    assert.equal(b.updates[0],'push:'+parent);
    b.router.stop();
  }
});
test('route navigation and back avoid history to external/login destination',()=>{
  const b=routerAt('/request/newrequest');
  b.router.back();
  assert.equal(b.location.pathname,'/request');
  assert.equal(b.updates.join(''),'push:/request');
});
test('browser popstate updates route display',()=>{
  const b=routerAt('/');
  b.location.pathname='/request/massrequest';
  b.eventTarget.fire('popstate');
  assert.equal(b.router.current().page,'massrequest');
  assert.equal(b.views.at(-1).backHref,'/request');
});
test('unsaved changes can prevent navigation and back',()=>{
  const b=routerAt('/request/newrequest',()=>false);
  assert.equal(b.router.back(),false);
  assert.equal(b.location.pathname,'/request/newrequest');
});
test('unknown/unsafe route never silently falls into Dashboard',()=>{
  assert.equal(resolveRoute('/unknown').status,404);
  assert.equal(resolveRoute('/request/detail/ABC%2FDEF').status,404);
  assert.equal(canonicalPath('//other-host/path'),null);
  const b=routerAt('/request');
  assert.equal(b.router.navigate('https://evil.example/path'),false);
  assert.equal(b.location.pathname,'/request');
});

function memoryGateway(fetchRequests,opts={}) {
  const map=new Map(),calls={read:0,write:0};
  const api=createResilientGateway({
    fetchRequests:async a=>{calls.read++;return fetchRequests(a)},
    fetchMeta:opts.fetchMeta,
    loadLastGood:async k=>map.get(k)||null,
    storeLastGood:async(k,v)=>{calls.write++;map.set(k,v)},
    now:opts.now||(()=>Date.parse('2026-10-14T12:00:00Z')),
    failureCooldownMs:opts.failureCooldownMs||60000
  });
  return {api,map,calls};
}
const args={verifiedViewerScope:'USER_1:COMMS',limit:50};

test('initial authenticated load stores last-good snapshot and correct count',async()=>{
  const x=memoryGateway(async()=>({requests:[{id:'REQ1'}],total:6037,nextCursor:'page2'}));
  const result=await x.api.getRequests(args);
  assert.equal(result.mode,'live');
  assert.equal(result.total,6037);
  assert.equal(result.requests[0].id,'REQ1');
  assert.equal(x.calls.write,1);
});
test('gateway timeout returns scoped last-good instead of empty records',async()=>{
  let broken=false;
  const x=memoryGateway(async()=>{
    if(broken)throw Object.assign(new Error('Backend gateway timed out (portalData)'),{code:'TIMEOUT'});
    return {requests:[{id:'REQ1'}],total:6037};
  });
  await x.api.getRequests(args);
  broken=true;
  const stale=await x.api.getRequests(args);
  assert.equal(stale.mode,'stale');
  assert.equal(stale.errorCode,'GATEWAY_TIMEOUT');
  assert.equal(stale.requests.length,1);
  assert.equal(stale.total,6037);
  const readCount=x.calls.read;
  await x.api.getRequests(args);
  assert.equal(x.calls.read,readCount,'Backoff must prevent polling storm');
});
test('first-time gateway timeout fails visibly, never a fake 0-ticket success',async()=>{
  const x=memoryGateway(async()=>{throw new Error('Backend gateway timed out (portalData)')});
  await assert.rejects(x.api.getRequests(args),/GATEWAY_TIMEOUT/);
});
test('malformed gateway response does not overwrite last good',async()=>{
  let n=0;const x=memoryGateway(async()=>++n===1?{requests:[{id:'REQ1'}],total:6037}:{ok:true});
  await x.api.getRequests(args);
  const result=await x.api.getRequests(args);
  assert.equal(result.mode,'stale');
  assert.equal(result.requests[0].id,'REQ1');
  assert.equal(x.calls.write,1);
});
test('suspicious zero cannot overwrite prior 6037 total',async()=>{
  let n=0;const x=memoryGateway(async()=>++n===1?{requests:[{id:'REQ1'}],total:6037}:{requests:[],total:0});
  await x.api.getRequests(args);
  const result=await x.api.getRequests(args);
  assert.equal(result.mode,'stale');
  assert.equal(result.errorCode,'GATEWAY_UNAVAILABLE');
  assert.equal(result.total,6037);
});
test('expired/forbidden session NEVER receives cached restricted requests',async()=>{
  let deny=false;const x=memoryGateway(async()=>{
    if(deny)throw Object.assign(new Error('Forbidden'),{status:403});
    return {requests:[{id:'REQ1'}],total:6037};
  });
  await x.api.getRequests(args);
  deny=true;
  await assert.rejects(x.api.getRequests(args),/ACCESS_DENIED/);
});
test('concurrent portalData calls deduplicate one backend request',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);
  const x=memoryGateway(async()=>{await gate;return {requests:[{id:'REQ1'}],total:6037}});
  const a=x.api.getRequests(args),b=x.api.getRequests(args);
  release();
  await Promise.all([a,b]);
  assert.equal(x.calls.read,1);
});
test('scope-specific cache never crosses roles/users',async()=>{
  const x=memoryGateway(async({verifiedViewerScope})=>
    ({requests:[{id:verifiedViewerScope}],total:1}));
  const a=await x.api.getRequests(args);
  const b=await x.api.getRequests({verifiedViewerScope:'USER_2:REQUESTER',limit:50});
  assert.notEqual(a.requests[0].id,b.requests[0].id);
  assert.equal(x.map.size,2);
});
test('portalMeta timeout degrades independently of portalData',async()=>{
  const x=memoryGateway(async()=>({requests:[{id:'REQ1'}],total:1}),{
    fetchMeta:async()=>{throw new Error('Backend gateway timed out (portalMeta)')}
  });
  const meta=await x.api.getMeta(args);
  const requests=await x.api.getRequests(args);
  assert.equal(meta.ok,false);
  assert.equal(meta.warning,'GATEWAY_TIMEOUT');
  assert.equal(requests.mode,'live');
});
