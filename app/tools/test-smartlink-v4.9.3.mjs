import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=fs.readFileSync(path.join(root,'backend/PortalApi.gs'),'utf8');

function makeBox({token='TOKEN_abcdefghijklmnopqrstuvwxyz',responses=[]}={}){
  let i=0; const fetchCalls=[];
  const box={
    console,
    PropertiesService:{getScriptProperties:()=>({getProperty:k=>k==='TINYURL_API_TOKEN'?token:'',setProperty(){}})},
    UrlFetchApp:{fetch:(url,opts)=>{fetchCalls.push({url,opts});const r=responses[Math.min(i++,responses.length-1)]||{code:200,body:{data:{tiny_url:'https://tinyurl.com/auto1'}}};return {getResponseCode:()=>r.code,getContentText:()=>JSON.stringify(r.body??{})};}},
    Utilities:{sleep(){},getUuid:()=> 'uuid',base64EncodeWebSafe:x=>'hash',computeDigest:()=>[1,2,3],DigestAlgorithm:{SHA_256:'SHA_256'}},
    SpreadsheetApp:{openById(){return {}}},
    PORTAL_DB_SPREADSHEET_ID:'db',
  };
  vm.createContext(box); vm.runInContext(src,box);
  box.__fetchCalls=fetchCalls; return box;
}

let b=makeBox({token:''});
assert.equal(b.createTinyUrlFree_('https://example.com','').status,'TOKEN_NOT_CONFIGURED');
assert.equal(b.__fetchCalls.length,0);
console.log('PASS missing token is fail-closed without network call');

b=makeBox({responses:[{code:200,body:{data:{tiny_url:'https://tinyurl.com/abc'}}}]});
let r=b.createTinyUrlFree_('https://example.com?a=1','');
assert.equal(r.shortUrl,'https://tinyurl.com/abc');assert.equal(r.status,'CREATED_AUTO');
assert.equal(JSON.parse(b.__fetchCalls[0].opts.payload).url,'https://example.com?a=1');
console.log('PASS auto TinyURL returns actual URL');

b=makeBox({responses:[{code:200,body:{data:{tiny_url:'https://tinyurl.com/GPT'}}}]});
r=b.createTinyUrlFree_('https://example.com','GPT');
assert.equal(r.shortUrl,'https://tinyurl.com/GPT');assert.equal(r.status,'CREATED_CUSTOM');
assert.equal(JSON.parse(b.__fetchCalls[0].opts.payload).alias,'GPT');
console.log('PASS custom alias returns requested TinyURL');

b=makeBox({responses:[
  {code:422,body:{errors:[{message:'Alias already exists'}]}},
  {code:200,body:{data:{tiny_url:'https://tinyurl.com/auto-fallback'}}}
]});
r=b.createTinyUrlFree_('https://example.com','GPT');
assert.equal(r.shortUrl,'https://tinyurl.com/auto-fallback');assert.equal(r.status,'CREATED_AUTO_FALLBACK');
assert.equal(b.__fetchCalls.length,2);assert.equal(JSON.parse(b.__fetchCalls[1].opts.payload).alias,undefined);
console.log('PASS alias collision falls back to a working auto TinyURL');

b=makeBox({responses:[
  {code:429,body:{message:'rate limited'}},
  {code:200,body:{data:{tiny_url:'https://tinyurl.com/retry-ok'}}}
]});
r=b.createTinyUrlFree_('https://example.com','');
assert.equal(r.shortUrl,'https://tinyurl.com/retry-ok');assert.equal(b.__fetchCalls.length,2);
console.log('PASS transient 429 retries and succeeds');

// Execute the repair path with controlled sheet mocks and verify that only safe fields are written.
b=makeBox();
const existing={tracking_id:'TRK-1',request_id:'REQ-1',generated_url:'https://example.com?utm_source=x',original_url:'https://example.com',short_url:'',status:'ACTIVE_TRACKING_ONLY',link_type:'TINYURL_FREE',utm_source:'x',utm_campaign:'c',external_reference_id:'GPT',created_at:'old'};
let writes=[],events=[],routes=[];
b.assertPortalRoles_=()=>true;b.ensureSmartLinkSchema_=()=>true;b.tinyUrlToken_=()=> 'TOKEN_abcdefghijklmnopqrstuvwxyz';
b.readObjects_=(db,sheet)=>sheet==='Tracking_Links'?[existing]:[];
b.findRowById_=()=>({row:2});
b.writeFields_=(found,obj)=>writes.push(obj);
b.appendShortLinkRoute_=(...args)=>routes.push(args);
b.appendByHeader_=(sheet,obj)=>events.push({sheet,obj});
b.portalClearDataCache_=()=>{};
b.createTinyUrlFree_=()=>({shortUrl:'https://tinyurl.com/GPT',status:'CREATED_CUSTOM'});
r=b.repairExistingSmartLinks_({limit:50},'admin@shopee.com');
assert.equal(r.repaired,1);assert.equal(writes.length,1);
assert.deepEqual(Object.keys(writes[0]).sort(),['short_url','status','updated_at'].sort());
for(const forbidden of ['original_url','generated_url','utm_source','utm_medium','utm_campaign','utm_content','utm_term','tracking_id','created_at'])assert.equal(Object.hasOwn(writes[0],forbidden),false);
assert.equal(routes.length,1);assert.equal(events.filter(x=>x.sheet==='Ticket_Events').length,1);
console.log('PASS repair updates only short_url/status/updated_at and preserves UTM/destination/identity fields');

console.log('6 Smart Link behavior tests passed.');
