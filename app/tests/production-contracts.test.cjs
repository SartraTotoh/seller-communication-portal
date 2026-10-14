/* Run: node --test app/tests/production-contracts.test.cjs
   Source-level and isolated logic tests. Does not certify deployed GAS. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const backend=path.resolve(__dirname,'../backend');
function source(file){return fs.readFileSync(path.join(backend,file),'utf8');}
const auth=source('AuthSession.gs');
const bridge=fs.readFileSync(path.resolve(__dirname,'../auth-bridge/Code.gs'),'utf8');
const api=source('PortalApi.gs');
const sync=source('TrackerSync.gs');
test('both GAS projects use fail-closed Script Properties and contain no active literal signing secret',()=>{
 assert.doesNotMatch(auth,/const\s+PORTAL_AUTH_SESSION_SECRET\s*=/);
 assert.doesNotMatch(bridge,/const\s+SCP_AUTH_BRIDGE_SECRET\s*=/);
 for(const text of [auth,bridge]){
  assert.match(text,/getScriptProperties\(\)\.getProperty\('PORTAL_AUTH_SESSION_SECRET'\)/);
  assert.match(text,/PORTAL_AUTH_SESSION_SECRET_NOT_CONFIGURED/);
 }
});
test('bootstrap admin exception is disabled after People setup',()=>{
 assert.match(api,/!peopleBootstrapCompleted_\(\)/);
 assert.match(api,/if\(u&&String\(u\.role\|\|''\)\.toUpperCase\(\)==='ADMIN'&&String\(u\.status\|\|''\)\.toUpperCase\(\)==='ACTIVE'\)return true/);
});
function isolate(names){
 const ctx=vm.createContext({});
 const segments=names.map(name=>{let start=sync.indexOf('function '+name+'(');assert.ok(start>=0,name+' missing');let open=sync.indexOf('{',start),level=1,i=open+1;while(level&&i<sync.length){if(sync[i]==='{')level++;if(sync[i]==='}')level--;i++;}return sync.slice(start,i);});
 vm.runInContext(segments.join('\n'),ctx);
 return ctx;
}
test('channel classification uses request source, not asset channel',()=>{
 const c=isolate(['portalRequestChannel_']);
 const cases=[['GOOGLE_SHEETS_PN','PN'],['GOOGLE_SHEETS_SC','SC'],['GOOGLE_SHEETS_SOCIAL','Social'],['PORTAL_NATIVE','Portal'],['unknown','Unclassified'],['','Unclassified']];
 for(const [source,expected] of cases)assert.equal(c.portalRequestChannel_({source_system:source,channel_group:'PN_EDM'}),expected);
});
test('summary preserves count and excludes source-exception statuses',()=>{
 const c=isolate(['portalRequestChannel_','portalChannelSummary_']);
 c.activePortalRequest_=r=>!['SOURCE_MISSING','SOURCE_EXCLUDED'].includes(String(r.status||'').toUpperCase());
 const rows=[{source_system:'GOOGLE_SHEETS_PN'},{source_system:'GOOGLE_SHEETS_SC'},{source_system:'GOOGLE_SHEETS_SOCIAL'},{source_system:'PORTAL_NATIVE'},{source_system:'unknown'},{source_system:'GOOGLE_SHEETS_PN',status:'SOURCE_MISSING'},{source_system:'GOOGLE_SHEETS_SC',status:'SOURCE_EXCLUDED'}];
 const result=c.portalChannelSummary_(rows);
 assert.equal(result.totalRequests,5);
 assert.equal(Object.values(result.byChannel).reduce((a,b)=>a+b,0),5);
 for(const value of Object.values(result.byChannel))assert.equal(value,1);
});
test('PIC is not implicitly an authenticated email',()=>{
 const c=isolate(['portalVerifiedOwnerEmail_']);
 assert.equal(c.portalVerifiedOwnerEmail_('Legacy PIC'),'');
 assert.equal(c.portalVerifiedOwnerEmail_('alias'),'');
 assert.equal(c.portalVerifiedOwnerEmail_('person@example.net'),'');
 assert.equal(c.portalVerifiedOwnerEmail_('TEST@shopee.com'),'test@shopee.com');
});
