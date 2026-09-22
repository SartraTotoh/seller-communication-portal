/* THSP downstream adapter. Host must implement durable merge and own-role checks. */
export function createThspContentBridge({endpoint,applySnapshot,saveSyncState}) {
 if(location.origin!=='https://thsp-education-portal.web.app')throw new Error('THSP origin required.');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))throw new Error('Approved communication backend required.');
 if(typeof applySnapshot!=='function'||typeof saveSyncState!=='function')throw new Error('Durable THSP callbacks required.');
 function call(payload){return new Promise((resolve,reject)=>{
  const id='selleredu-'+crypto.randomUUID(),frame=document.createElement('iframe'),form=document.createElement('form');frame.hidden=true;frame.name=id;form.hidden=true;form.method='POST';form.action=endpoint;form.target=id;
  for(const [name,value] of Object.entries({bridge:'1',bridge_id:id,action:'content.operations',payload:JSON.stringify(payload)})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
  const clean=()=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();form.remove();};
  function receive(e){if(!/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+-)?script\.googleusercontent\.com)$/.test(e.origin)||e.data?.__sellerCommsBridge!==1||e.data?.id!==id)return;clean();e.data.payload?.ok?resolve(e.data.payload.data):reject(new Error(e.data.payload?.error||'Sync failed'));}
  const timer=setTimeout(()=>{clean();reject(new Error('Workspace connection timed out. Retry after sign-in.'));},120000);window.addEventListener('message',receive);document.body.append(frame,form);form.submit();
 });}

 async function sync(){
  await saveSyncState({status:'SYNCING',source:'SELLER_COMMUNICATION'});
  try{
   const feed=await call({operation:'thspFeed'});
   if(feed.targetPortal!=='thsp-education-portal.web.app'||feed.schemaVersion!==1||!Array.isArray(feed.items))throw new Error('Invalid downstream contract.');
   await applySnapshot(feed); // Upsert externalId + revision, preserving Trainer/Seller Education records.
   await saveSyncState({status:'UP_TO_DATE',source:'SELLER_COMMUNICATION',lastSuccessfulSyncAt:feed.generatedAt,count:feed.items.length});return feed;
  }catch(e){await saveSyncState({status:'FAILED',source:'SELLER_COMMUNICATION',error:e.message});throw e;}
 }
 function start({intervalMs=60000,onError=()=>{}}={}){
  let busy=false;const tick=async()=>{if(busy)return;busy=true;try{await sync();}catch(e){onError(e);}finally{busy=false;}};
  const timer=setInterval(tick,Math.max(60000,intervalMs));tick();return ()=>clearInterval(timer);
 }
 return {sync,retry:sync,start};
}
