const test=require('node:test');
const assert=require('node:assert/strict');
const {hosts,routes,inspect,probe,summarize}=require('./three-portal-public-smoke.cjs');
test('four allowlisted production hosts, no arbitrary domains',()=>{
 assert.equal(hosts.length,4);
 assert.ok(hosts.every(h=>h.origin.endsWith('.web.app')));
 assert.ok(Object.values(routes).flat().every(p=>p.startsWith('/')&&!p.includes('?')));
});
test('Sentiment source and connection markers remain distinguishable',()=>{
 const m=inspect('<html><div id="cfgTabLine"></div><div id="cfgContentCollector"></div></html>','sentiment','/');
 assert.equal(m.markers.cfgTabLine,true);
 assert.equal(m.markers.cfgContentModules,false);
 assert.equal(m.markers.lineOfficialAccount,false);
});
test('public probe does not send tokens or follow redirects',async()=>{
 const calls=[];
 const fake=async(url,init)=>{
  calls.push({url,init});
  return {
   status:200,
   headers:{get:(n)=>n==='content-type'?'text/html':n==='content-length'?'40':null},
   text:async()=>'<html><script src="/app.js"></script></html>'
  };
 };
 const rows=await probe(fake);
 assert.equal(rows.length,hosts.reduce((n,h)=>n+routes[h.kind].length,0));
 assert.ok(rows.every(x=>x.status===200));
 assert.ok(calls.every(x=>x.init.redirect==='manual'&&x.init.method==='GET'));
 assert.ok(calls.every(x=>!x.url.includes('?')&&!x.url.includes('token')));
 assert.equal(summarize(rows).length,4);
});
test('missing portal reports 0 and never pretends successful availability',()=>{
 const s=summarize([{system:'SENTIMENT',path:'/',status:0,error:'NETWORK_FAILURE'}]);
 assert.equal(s[0].publicRootHTTP,0);
 assert.equal(s[0].routesOk,0);
});
