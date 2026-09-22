/** Content Operations v4.9.0. Append-only state journal; existing source trackers remain read-only. */
function opsUrl_(s){return /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(String(s||''));}
function opsReady_(c){
 const missing=[];
 ['title','caption','channel','account','owner'].forEach(k=>{if(!String(c[k]||'').trim())missing.push(k);});
 if(c.type!=='TEXT'&&!opsUrl_(c.assetUrl))missing.push('assetUrl');
 if(c.destinationRequired&&!opsUrl_(c.destinationUrl))missing.push('destinationUrl');
 if(c.source==='SELLER_EDUCATION'&&c.taskStatus!=='COMPLETED')missing.push('completed source task');
 return {ready:!missing.length,missing:missing};
}
function opsConflict_(c,all){
 if(!c.scheduledAt)return [];
 const t=Date.parse(c.scheduledAt);
 return all.filter(x=>x.id!==c.id&&['SCHEDULED','PUBLISHED'].indexOf(x.status)>=0&&x.channel===c.channel&&x.account===c.account&&Math.abs(Date.parse(x.scheduledAt)-t)<30*60000).map(x=>({id:x.id,title:x.title,scheduledAt:x.scheduledAt}));
}
function opsSchema_(){ensureSheetColumns_(SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),'Content_Operations_Journal',['event_id','content_id','revision','action','actor','created_at','state_json']);}
function opsEvents_(){return readObjects_(PORTAL_DB_SPREADSHEET_ID,'Content_Operations_Journal');}
function opsStates_(events){const map={};events.forEach(e=>{const c=JSON.parse(e.state_json);map[c.id]=c;});return Object.keys(map).map(k=>map[k]);}
function opsCanRead_(v,c){return ['ADMIN','COMMS','REVIEWER'].indexOf(v.role)>=0||c.owner===v.email||c.createdBy===v.email;}
function opsClean_(p){
 const c={};['title','caption','channel','account','owner','assetUrl','destinationUrl','type','taskId','taskStatus','source','sourceUrl'].forEach(k=>c[k]=String(p[k]||'').trim());
 c.owner=c.owner.toLowerCase();c.type=c.type||'IMAGE';c.source=c.source||'PORTAL';c.destinationRequired=p.destinationRequired===true;
 if(['TEXT','IMAGE','VIDEO'].indexOf(c.type)<0)throw new Error('Choose TEXT, IMAGE or VIDEO.');
 if(['PORTAL','SELLER_EDUCATION'].indexOf(c.source)<0)throw new Error('Unknown source.');
 if(c.owner&&!corporateEmail_(c.owner))throw new Error('Owner must use a corporate email.');
 ['assetUrl','destinationUrl','sourceUrl'].forEach(k=>{if(c[k]&&!opsUrl_(c[k]))throw new Error(k+' must be an HTTPS URL.');});
 if(c.source==='SELLER_EDUCATION'&&(!c.taskId||!c.channel||!c.account))throw new Error('Source task ID, channel and account are required.');
 if(c.sourceUrl&&!/^https:\/\/selleredu-portal\.web\.app(?:\/|$)/i.test(c.sourceUrl))throw new Error('Source link must point to selleredu-portal.web.app.');
 if(c.caption.length>20000)throw new Error('Caption is too long.');
 return c;
}
function contentOperations(p){return opsDispatch_(p||{},portalCurrentEmail_());}
function opsDispatch_(p,email){
 const v=portalViewerContext_(email),action=String(p.operation||'list');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
 opsSchema_();const events=opsEvents_(),all=opsStates_(events);
 if(action==='thspFeed')return {schemaVersion:1,sourcePortal:'seller-communication-portal.web.app',targetPortal:'thsp-education-portal.web.app',generatedAt:new Date().toISOString(),completeSnapshot:true,scope:'CONTENT_OPERATIONS_AUTHORIZED_USER',items:all.filter(c=>opsCanRead_(v,c)).map(c=>({externalId:'SELLER_COMMS:'+c.id,contentId:c.id,taskId:c.taskId||null,taskSource:c.source,title:c.title,channel:c.channel,account:c.account,status:c.status,scheduledAt:c.scheduledAt||null,publishedAt:c.publishedAt||null,postUrl:c.postUrl||null,metrics:c.metrics||[],revision:c.revision,updatedAt:c.updatedAt,sourceUrl:'https://seller-communication-portal.web.app/#operations',ownership:{task:c.source==='SELLER_EDUCATION'?'SELLER_EDUCATION':'SELLER_COMMUNICATION',schedule:'SELLER_COMMUNICATION',tracking:'SELLER_COMMUNICATION'},readOnly:true}))};
 if(action==='list')return {items:all.filter(c=>opsCanRead_(v,c)).map(c=>Object.assign({},c,{readiness:opsReady_(c),conflicts:opsConflict_(c,all)})),role:v.role};
 let c=all.find(x=>x.id===p.id),before=c?JSON.parse(JSON.stringify(c)):null;
 if(action==='history'){
  if(!c||!opsCanRead_(v,c))throw new Error('Content access denied.');
  return events.filter(e=>e.content_id===c.id).map(e=>({revision:e.revision,action:e.action,actor:e.actor,at:e.created_at,state:JSON.parse(e.state_json)}));
 }
 if(action==='save'){
  if(['ADMIN','COMMS','REQUESTER'].indexOf(v.role)<0)throw new Error('Content editing permission required.');
  const clean=opsClean_(p.content||{});
  if(clean.source==='SELLER_EDUCATION'){
   const duplicate=all.find(x=>x.source==='SELLER_EDUCATION'&&x.taskId===clean.taskId&&x.channel===clean.channel&&x.account===clean.account);
   if(duplicate&&!c){
    if(!opsCanRead_(v,duplicate))throw new Error('Content access denied.');
    return {item:duplicate,deduplicated:true};
   }
   if(duplicate&&c&&duplicate.id!==c.id)throw new Error('This task and channel already have a linked content item.');
  }
  if(c&&v.role==='REQUESTER'&&c.owner!==v.email&&c.createdBy!==v.email)throw new Error('Content editing permission denied.');
  if(v.role==='REQUESTER'&&clean.owner!==v.email)throw new Error('Requester must own their content.');
  if(c&&c.status==='PUBLISHED')throw new Error('Published content is immutable. Create a new content item.');
  if(c&&Number(p.revision)!==c.revision)throw new Error('Content changed. Refresh before saving.');
  c=Object.assign({},c||{id:'OPS-'+Utilities.getUuid(),revision:0,version:0,createdBy:v.email,createdAt:new Date().toISOString(),metrics:[]},clean);
  c.version++;c.approvedVersion=null;c.approvedBy='';c.scheduledAt='';c.postUrl='';c.publishedAt='';
  c.status=opsReady_(c).ready?'READY_FOR_REVIEW':'DRAFT';
 }else{
  if(!c||!opsCanRead_(v,c))throw new Error('Content access denied.');
  if(action!=='feedback'&&Number(p.revision)!==c.revision)throw new Error('Content changed. Refresh before continuing.');
  c=JSON.parse(JSON.stringify(c));
  if(action==='approve'){
   if(['ADMIN','REVIEWER'].indexOf(v.role)<0)throw new Error('Reviewer or Admin permission required.');
   if(c.status==='PUBLISHED')throw new Error('Already published.');
   const check=opsReady_(c);if(!check.ready)throw new Error('Missing: '+check.missing.join(', '));
   c.approvedVersion=c.version;c.approvedBy=v.email;c.approvedAt=new Date().toISOString();c.status='READY_TO_SCHEDULE';
  }else if(action==='schedule'){
   if(['ADMIN','COMMS'].indexOf(v.role)<0)throw new Error('Comms or Admin permission required.');
   if(c.status==='PUBLISHED'||c.approvedVersion!==c.version||!opsReady_(c).ready)throw new Error('Current version must be approved and ready.');
   if(!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(String(p.scheduledAt||''))||!(Date.parse(p.scheduledAt)>Date.now()))throw new Error('Choose a future time with timezone.');
   c.scheduledAt=new Date(p.scheduledAt).toISOString();const conflicts=opsConflict_(c,all);
   if(conflicts.length)throw new Error('Schedule conflict within 30 minutes: '+conflicts.map(x=>x.title).join(', '));
   c.status='SCHEDULED';
  }else if(action==='publish'){
   if(['ADMIN','COMMS'].indexOf(v.role)<0)throw new Error('Comms or Admin permission required.');
   if(c.status!=='SCHEDULED'||c.approvedVersion!==c.version)throw new Error('Schedule the approved version first.');
   if(!opsUrl_(p.postUrl)||!p.publishedAt||!Number.isFinite(Date.parse(p.publishedAt))||Date.parse(p.publishedAt)>Date.now())throw new Error('Provide a real HTTPS post link and valid publication time.');
   c.status='PUBLISHED';c.postUrl=String(p.postUrl);c.publishedAt=new Date(p.publishedAt).toISOString();
  }else if(action==='metrics'){
   if(['ADMIN','COMMS'].indexOf(v.role)<0)throw new Error('Comms or Admin permission required.');
   if(c.status!=='PUBLISHED')throw new Error('Publication evidence is required before metrics.');
   const m=p.metrics||{},entry={capturedAt:new Date().toISOString(),recordedBy:v.email};
   ['periodStart','periodEnd'].forEach(k=>{if(!m[k]||!Number.isFinite(Date.parse(m[k])))throw new Error('Valid measurement period required.');entry[k]=new Date(m[k]).toISOString();});
   if(entry.periodStart>entry.periodEnd||Date.parse(entry.periodEnd)>Date.now())throw new Error('Invalid measurement period.');
   entry.distribution=String(m.distribution||'ORGANIC');if(['ORGANIC','PAID','COMBINED'].indexOf(entry.distribution)<0)throw new Error('Invalid distribution.');
   entry.evidenceUrl=String(m.evidenceUrl||'');if(!opsUrl_(entry.evidenceUrl))throw new Error('Metrics evidence URL required.');
   ['reach','impressions','engagements','clicks','videoViews'].forEach(k=>{const val=m[k];entry[k]=val===''||val===null||val===undefined?null:Number(val);if(entry[k]!==null&&(!Number.isFinite(entry[k])||entry[k]<0||!Number.isInteger(entry[k])))throw new Error('Invalid '+k);});
   if(!['reach','impressions','engagements','clicks','videoViews'].some(k=>entry[k]!==null))throw new Error('Enter at least one metric.');
   c.metrics.push(entry);
  }else if(action==='restore'){
   if(v.role!=='ADMIN')throw new Error('Admin permission required.');
   if(c.status==='PUBLISHED')throw new Error('Cannot restore over published content.');
   const e=events.find(x=>x.content_id===c.id&&Number(x.revision)===Number(p.restoreRevision));if(!e)throw new Error('Version not found.');
   const prior=JSON.parse(e.state_json);const fields=opsClean_(prior);c=Object.assign(c,fields);c.version++;c.approvedVersion=null;c.approvedBy='';c.scheduledAt='';c.status='DRAFT';
  }else if(action==='retry'){
   if(['ADMIN','COMMS'].indexOf(v.role)<0)throw new Error('Comms or Admin permission required.');
   // The source portal pulls feedback under the active Workspace identity. No unauthenticated callback.
   c.feedbackStatus='PENDING';c.feedbackError='';
  }else if(action==='feedback'){
   if(c.source!=='SELLER_EDUCATION')throw new Error('No source task linked.');
   return {taskId:c.taskId,contentId:c.id,channel:c.channel,account:c.account,revision:c.revision,status:c.status,scheduledAt:c.scheduledAt||null,publishedAt:c.publishedAt||null,postUrl:c.postUrl||null,metrics:c.metrics||[]};
  }else if(action==='ack'){
   if(c.source!=='SELLER_EDUCATION')throw new Error('No source task linked.');
   c.feedbackStatus='DELIVERED';c.feedbackError='';c.feedbackAcknowledgedAt=new Date().toISOString();
  }else throw new Error('Unknown Content Operations action.');
 }
 c.revision++;c.updatedAt=new Date().toISOString();
 if(c.source==='SELLER_EDUCATION'&&action!=='ack'){c.feedbackStatus='PENDING';c.feedbackError='';}
 const serialized=JSON.stringify(c);if(serialized.length>45000)throw new Error('Content history payload is full. Export metrics before adding more.');
 appendByHeader_('Content_Operations_Journal',{event_id:Utilities.getUuid(),content_id:c.id,revision:c.revision,action:action,actor:v.email,created_at:c.updatedAt,state_json:serialized});
 return {item:c,readiness:opsReady_(c),conflicts:opsConflict_(c,all)};
 }finally{lock.releaseLock();}
}
