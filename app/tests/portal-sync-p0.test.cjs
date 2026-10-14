const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const begin=html.indexOf('const PortalSync = (()=>{');
const end=html.indexOf('const LocalDataServer = (()=>{',begin);
assert.ok(begin>=0 && end>begin,'PortalSync block missing');

function setup({config='',override='',snapshot=null,workspaceSession=''}={}) {
  const removed=[];
  const requests=[];
  const context={
    window:{PORTAL_SYNC_จุดเชื่อมต่อ:override},
    APP:{data:{businessConfig:config?[{id:'tracker_sync_endpoint',value:config}]:[]}},
    storageGet:()=>'',number:Number,
    createBaseData:()=>({requests:[],campaigns:[],lookups:{},sourceMeta:{}}),
    unique:x=>[...new Set(x)],
    scpWorkspaceSession:()=>workspaceSession,
    scpIsAuthError:()=>false,
    scpClearWorkspaceSession:()=>{},
    scpStartWorkspaceLogin:()=>{},
    fetch:async(url)=>{requests.push(url);return {ok:!!snapshot,json:async()=>snapshot}},
    document:{
      createElement:()=>({remove:()=>removed.push('script')}),
      head:{appendChild:()=>requests.push('script-append')},
      visibilityState:'visible'
    },
    setTimeout:(fn)=>42,clearTimeout:()=>{},setInterval:()=>1,clearInterval:()=>{},
    console:{warn:()=>{}},
  };
  vm.createContext(context);
  vm.runInContext(html.slice(begin,end)+';globalThis.__portalSync=PortalSync;',context,{timeout:1000});
  return {portal:context.__portalSync,context,requests,removed};
}

test('explicit approved endpoint wins over stale legacy constant',()=>{
  const p=setup({config:'https://script.google.com/macros/s/new-version/exec'});
  assert.equal(p.portal.endpoint(),'https://script.google.com/macros/s/new-version/exec');
});
test('runtime override takes precedence over business setting',()=>{
  const p=setup({
    override:'https://script.google.com/a/macros/shopee.com/s/runtime-version/exec',
    config:'https://script.google.com/macros/s/old-version/exec'
  });
  assert.equal(p.portal.endpoint(),'https://script.google.com/a/macros/shopee.com/s/runtime-version/exec');
});
test('untrusted endpoint is blocked before any session-bearing JSONP',()=>{
  const p=setup({config:'https://attacker.example/harvest'});
  assert.equal(p.portal.endpoint(),'');
});
test('source snapshot v1 shape 2 parses mapped columns without undefined Headers',async()=>{
  const snap={generatedAt:'2026-10-14T00:00:00Z',sources:[{
    key:'PN',sheets:[{headers:['Business Line','Campaign Name','Title','Content','Requestor','Asset Type','Date'],
      rows:[['Seller','Q4 Launch','Hello','Official caption','Requester','PN','2026-10-20']]}]}]};
  const p=setup({config:'http://invalid.example/',snapshot:snap});
  const data=await p.portal.load();
  assert.equal(data.requests.length,1);
  assert.equal(data.requests[0].campaign,'Q4 Launch');
  assert.equal(data.requests[0].title,'Hello');
  assert.equal(data.requests[0].department,'Seller');
  assert.equal(data.sourceMeta.mode,'cloud');
  assert.ok(p.requests.includes('/data/source-snapshot-2026.json'));
});
test('workspace session missing cleans up JSONP callback before fallback',async()=>{
  const p=setup({config:'https://script.google.com/macros/s/valid-version/exec',workspaceSession:'',
    snapshot:{requests:[{id:'SNAPSHOT-1',title:'Safe fallback'}]}});
  const data=await p.portal.load();
  assert.equal(data.requests.length,1);
  assert.ok(p.removed.includes('script'),'temporary script removed');
  assert.deepEqual(Object.keys(p.context.window).filter(x=>x.startsWith('__portalSync_')),[]);
  assert.ok(!p.requests.includes('script-append'),'unauthorized script never appended');
});
