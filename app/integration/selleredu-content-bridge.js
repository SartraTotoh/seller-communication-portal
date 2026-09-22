/* Browser adapter for the authenticated Seller Education task UI.
   The host supplies durable task storage; no credentials or content are stored in localStorage.
   Install only in selleredu-portal.web.app. See INTEGRATION.md. */
export function createSellerCommsBridge({endpoint,saveSyncState,saveTracking}) {
 if(location.origin!=='https://selleredu-portal.web.app')throw new Error('Seller Education origin required.');
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(endpoint))throw new Error('Use the deployed, DOMAIN-protected communication backend /exec URL.');
 if(typeof saveSyncState!=='function'||typeof saveTracking!=='function')throw new Error('Durable source task save callbacks are required.');
 function call(payload){return new Promise((resolve,reject)=>{
  const id='selleredu-'+crypto.randomUUID(),frame=document.createElement('iframe'),form=document.createElement('form');frame.hidden=true;frame.name=id;form.hidden=true;form.method='POST';form.action=endpoint;form.target=id;
  for(const [name,value] of Object.entries({bridge:'1',bridge_id:id,action:'content.operations',payload:JSON.stringify(payload)})){const input=document.createElement('input');input.type='hidden';input.name=name;input.value=value;form.append(input);}
  const clean=()=>{clearTimeout(timer);window.removeEventListener('message',receive);frame.remove();form.remove();};
  function receive(e){if(!/^https:\/\/(?:script\.google\.com|(?:[a-z0-9-]+-)?script\.googleusercontent\.com)$/.test(e.origin)||e.data?.__sellerCommsBridge!==1||e.data?.id!==id)return;clean();e.data.payload?.ok?resolve(e.data.payload.data):reject(new Error(e.data.payload?.error||'Sync failed'));}
  const timer=setTimeout(()=>{clean();reject(new Error('Workspace connection timed out. Retry after sign-in.'));},120000);window.addEventListener('message',receive);document.body.append(frame,form);form.submit();
 });}
 async function link(task){
  // Pass one channel/account variant per call. Host maps its verified completed status to COMPLETED.
  const content={...task,source:'SELLER_EDUCATION',taskId:task.taskId};
  await saveSyncState(task.taskId,task.channel,task.account,{status:'SYNCING'});
  try{
   const result=await call({operation:'save',content});
   await saveSyncState(task.taskId,task.channel,task.account,{status:'LINKED',contentId:result.item.id,revision:result.item.revision,url:'https://seller-communication-portal.web.app/#operations'});
   return result;
  }catch(e){await saveSyncState(task.taskId,task.channel,task.account,{status:'FAILED',error:e.message});throw e;}
 }
 async function onTaskCompleted(task){
  const missing=['taskId','title','caption','channel','account','owner'].filter(k=>!String(task[k]||'').trim());
  if(task.taskStatus!=='COMPLETED')return {synced:false,reason:'TASK_NOT_COMPLETED'};
  if(task.type!=='TEXT'&&!task.assetUrl)missing.push('assetUrl');if(task.destinationRequired&&!task.destinationUrl)missing.push('destinationUrl');
  if(missing.length){await saveSyncState(task.taskId,task.channel,task.account,{status:'NEEDS_INPUT',missing});return {synced:false,missing};}
  return link(task);
 }
 async function pullFeedback({taskId,channel,account,contentId,revision}){
  try{
   const result=await call({operation:'feedback',id:contentId,revision});
   if(result.taskId!==taskId||result.channel!==channel||result.account!==account)throw new Error('Feedback identity mismatch.');
   await saveTracking(taskId,channel,account,result); // Upsert by contentId + revision, not increment totals.
   const ack=await call({operation:'ack',id:contentId,revision:result.revision});
   await saveSyncState(taskId,channel,account,{status:'UP_TO_DATE',contentId,revision:ack.item.revision});return result;
  }catch(e){await saveSyncState(taskId,channel,account,{status:'FAILED',contentId,error:e.message});throw e;}
 }
 async function syncPendingFeedback(){
  const {items}=await call({operation:'list'});const results=[];
  for(const item of items.filter(x=>x.source==='SELLER_EDUCATION'&&x.feedbackStatus==='PENDING')){
   try{results.push({contentId:item.id,ok:true,data:await pullFeedback({taskId:item.taskId,channel:item.channel,account:item.account,contentId:item.id,revision:item.revision})});}
   catch(e){results.push({contentId:item.id,ok:false,error:e.message});}
  }return results;
 }
 function startFeedbackSync({intervalMs=60000,onError=()=>{}}={}){
  let busy=false;const tick=async()=>{if(busy)return;busy=true;try{await syncPendingFeedback();}catch(e){onError(e);}finally{busy=false;}};
  const timer=setInterval(tick,Math.max(60000,intervalMs));tick();return ()=>clearInterval(timer);
 }
 return {link,onTaskCompleted,pullFeedback,syncPendingFeedback,startFeedbackSync,retry:link};
}
