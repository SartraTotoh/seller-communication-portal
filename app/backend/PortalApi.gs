/** Production write gateway for Portal DB only. Source trackers are never mutated. */
function doPost(e){
  const bridge = !!(e && e.parameter && String(e.parameter.bridge || '') === '1');
  const bridgeId = bridge ? String(e.parameter.bridge_id || '') : '';
  try{
    let body;
    if (bridge) body={action:String(e.parameter.action||''),payload:JSON.parse(String(e.parameter.payload||'{}'))};
    else body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    const action=String(body.action||''),payload=canonicalizePayload_(body.payload||{});
    const sessionToken=bridge?String(e.parameter.session||''):String(body.session||'');
    portalAuthorizeHttpSession_(sessionToken);
    const email=portalCurrentEmail_();portalViewerContext_(email);ensurePortalCloseoutSchema_();
    let data;
    if(action==='content.operations')data=opsDispatch_(payload,email);
    else if(action==='request.create')data=authorizedCreatePortalRequest_(payload,email);
    else if(action==='request.update')data=authorizedUpdatePortalRequest_(payload,email);
    else if(action==='review.decision')data=authorizedReviewDecision_(payload,email);
    else if(action==='review.comment')data=saveReviewComment_(payload,email);
    else if(action==='cycle.save')data=authorizedCycleSave_(payload,email);
    else if(action==='smartlink.create')data=authorizedSmartLink_(payload,email);
    else if(action==='smartlink.status')data=smartLinkProviderStatus_(payload,email);
    else if(action==='smartlink.configure')data=configureTinyUrlProvider_(payload,email);
    else if(action==='smartlink.backfill')data=repairExistingSmartLinks_(payload,email);
    else if(action==='content.create')data=createPortalContent_(payload,email);
    else if(action==='content.analyze')data=authorizedAnalyzeContent_(payload,email);
    else if(action==='artwork.upload')data=authorizedUploadArtwork_(payload,email);
    else if(action==='lookup.save')data=saveLookup_(payload,email);
    else if(action==='lookup.delete')data=deleteLookup_(payload,email);
    else if(action==='config.save')data=saveBusinessConfig_(payload,email);
    else if(action==='scoring.version')data=saveScoringModelVersion_(payload,email);
    else if(action==='api.queue')data=apiCenterQueuePublicationV475_(payload,email);
    else if(action==='api.status')data=apiCenterConnectionStatusV475_(payload.id||payload.connectionId,email);
    else if(action==='api.approve')data=apiCenterApprovePublicationV475_(payload.id||payload.queueId,email);
    else if(action==='api.send')data=apiCenterSendPublicationV475_(payload.id||payload.queueId,email);
    else if(action==='people.save')data=saveTeamMember(payload,email);
    else if(action==='people.massImport')data=massImportUsers(payload,email);
    else if(action==='sync.now')data=authorizedSyncNow_(email);
    else if(action==='triggers.install'){ assertAdminUser_(email); data=installPortalAutomatedTriggers_(); }
    else if(action==='people.seedAll'){ assertAdminUser_(email); data=ensurePeopleSeedV480ForSetup_(email); }
    else { if(typeof legacyPortalHttpPost_==='function')return legacyPortalHttpPost_(e); throw new Error('Unknown action.'); }
    portalClearDataCache_();
    const out={ok:true,data:data};
    return bridge ? bridgeOutput_(bridgeId,out) : jsonOutput_(out);
  }catch(err){
    const out={ok:false,error:String(err&&err.message?err.message:err)};
    return bridge ? bridgeOutput_(bridgeId,out) : jsonOutput_(out);
  }
}
function bridgeOutput_(bridgeId,obj){
  const safeId=JSON.stringify(String(bridgeId||''));
  const payload=JSON.stringify(obj).replace(/</g,String.fromCharCode(92)+'u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  return HtmlService.createHtmlOutput('<!doctype html><html><body><script>parent.postMessage({__sellerCommsBridge:1,id:'+safeId+',payload:'+payload+'},\"*\");<\/script></body></html>')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function jsonOutput_(obj){return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);}
function assertCorporateUser_(email){if(!corporateEmail_(email))throw new Error('Corporate Workspace account required.');}
function dbSheet_(name){
  const sh=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID).getSheetByName(name);
  if(!sh)throw new Error('DB sheet not found: '+name);
  return sh;
}

function ensureSheetColumns_(ss,name,requiredHeaders){
  let sh=ss.getSheetByName(name);
  if(!sh)sh=ss.insertSheet(name);
  let lastCol=sh.getLastColumn();
  let headers=lastCol?sh.getRange(1,1,1,lastCol).getDisplayValues()[0].map(String):[];
  const hasRealHeader=headers.some(function(h){return String(h||'').trim();});
  if(!hasRealHeader){
    headers=requiredHeaders.slice();
    if(sh.getMaxColumns()<headers.length)sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.setFrozenRows(1);
    return sh;
  }
  const missing=requiredHeaders.filter(function(h){return headers.indexOf(h)<0;});
  if(missing.length){
    const target=headers.length+missing.length;
    if(sh.getMaxColumns()<target)sh.insertColumnsAfter(sh.getMaxColumns(),target-sh.getMaxColumns());
    sh.getRange(1,headers.length+1,1,missing.length).setValues([missing]);
  }
  return sh;
}

function ensurePeopleSchema_(){
  const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID);
  ensureSheetColumns_(ss,'Users',[
    'user_id','email','display_name','team_id','role','status','manager_email','identity_status','source_identity',
    'can_review_pn','can_review_sc','can_review_artwork','can_manage_cycles','can_manage_notifications','created_at','updated_at'
  ]);
  ensureSheetColumns_(ss,'Teams',[
    'team_id','department','team_name','team_cluster','team_category','team_role','status','manager_email','created_at','updated_at',
    'approval_owner_email','pillar_lead_email','sort_order'
  ]);
  ensureSheetColumns_(ss,'User_Import_Jobs',[
    'import_job_id','file_name','import_mode','total_rows','valid_rows','inserted_rows','updated_rows','skipped_rows','error_rows',
    'status','started_at','completed_at','created_by','template_version','notes'
  ]);
  ensureSheetColumns_(ss,'User_Import_Rows',[
    'import_row_id','import_job_id','source_row_number','email','display_name','role','department','team','team_id','manager_email','active',
    'review_capabilities_json','validation_status','action_taken','error_code','error_message','existing_user_id','result_user_id','processed_at'
  ]);
  return true;
}

function appendByHeader_(sheetName,obj){
  const sh=dbSheet_(sheetName),headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0],row=headers.map(function(h){return obj[h]===undefined?'':obj[h];});
  sh.appendRow(row);return obj;
}
function findRowById_(sheetName,idHeader,id){
  const sh=dbSheet_(sheetName),headers=sh.getRange(1,1,1,sh.getLastColumn()).getDisplayValues()[0],idx=headers.indexOf(idHeader);
  if(idx<0)throw new Error(idHeader+' column missing.');
  const count=Math.max(0,sh.getLastRow()-1);if(!count)return null;
  const vals=sh.getRange(2,idx+1,count,1).getDisplayValues();
  for(let i=0;i<vals.length;i++)if(String(vals[i][0])===String(id))return {sheet:sh,row:i+2,headers:headers};
  return null;
}
function writeFields_(found,fields){
  if(!found)return;
  Object.keys(fields).forEach(function(k){const c=found.headers.indexOf(k);if(c>=0)found.sheet.getRange(found.row,c+1).setValue(fields[k]);});
}
// Break-glass bootstrap identities are limited to ADMIN users already provisioned in the bundled People seed.
// They are honored only until PEOPLE_SEED_V474_STATUS is COMPLETED; after that, Users is authoritative.
const PORTAL_BOOTSTRAP_ADMIN_EMAILS = [
  'totoh.taponchai@shopee.com',
  'sellereducation.th@shopee.com'
];
function peopleBootstrapCompleted_(){
  try{
    const cfg=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Config');
    const row=cfg.find(function(x){return String(x.key||'').toUpperCase()==='PEOPLE_SEED_V474_STATUS';});
    return !!row && String(row.value||'').toUpperCase()==='COMPLETED';
  }catch(ignore){return false;}
}
function assertAdminUser_(email){
  const rows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Users'),normalized=String(email||'').trim().toLowerCase();
  const u=rows.find(function(x){return String(x.email||'').trim().toLowerCase()===normalized;});
  if(PORTAL_BOOTSTRAP_ADMIN_EMAILS.indexOf(normalized)>=0 && /@shopee\.com$/i.test(normalized))return true;
  if(u&&String(u.role||'').toUpperCase()==='ADMIN'&&String(u.status||'').toUpperCase()==='ACTIVE')return true;
  throw new Error('Admin permission required. Sign in with an active Portal Admin account.');
}
function corporateEmail_(v){return /^[^\s@]+@(shopee\.com|shopeemobile-external\.com)$/i.test(String(v||'').trim());}
function boolText_(v){return v===true||/^(true|yes|y|1|active)$/i.test(String(v||'').trim())?'TRUE':'FALSE';}
function peopleBool_(v,defaultValue){
  if(v===true||v===false)return v;
  const x=String(v===undefined||v===null?'':v).trim().toLowerCase();
  if(['true','yes','y','1','active'].indexOf(x)>=0)return true;
  if(['false','no','n','0','inactive'].indexOf(x)>=0)return false;
  if(!x)return !!defaultValue;
  throw new Error('Boolean value expected, received: '+v);
}
function peopleCleanOrgValue_(v){
  const x=String(v===undefined||v===null?'':v).trim();
  return /^(#?n\/a|na|null|none|-)$/i.test(x)?'':x;
}
function peopleTeamPathFromRow_(r){
  const explicit=peopleCleanOrgValue_(r.team||r.teamName||r.team_name||'');
  if(explicit)return explicit;
  const parts=[r.teamCluster||r.team_cluster||r['Team (Clus.)'],r.teamCategory||r.team_category||r['team (Cat.)'],r.teamRole||r.team_role||r['Team (Role)']]
    .map(peopleCleanOrgValue_).filter(Boolean);
  return parts.length?parts.join(' / '):'Unassigned';
}
function peopleTeamPartsFromRow_(r){
  return {
    cluster:peopleCleanOrgValue_(r.teamCluster||r.team_cluster||r['Team (Clus.)']),
    category:peopleCleanOrgValue_(r.teamCategory||r.team_category||r['team (Cat.)']),
    role:peopleCleanOrgValue_(r.teamRole||r.team_role||r['Team (Role)'])
  };
}
function validateUserPayload_(p,options){
  options=options||{};
  const role=String(p.role||'REQUESTER').trim().toUpperCase(),dept=String(p.department||'').trim(),email=String(p.email||'').trim(),manager=String(p.managerEmail||p.manager_email||'').trim();
  if(!corporateEmail_(email))throw new Error('Corporate Shopee email required: '+email);
  if(['REQUESTER','COMMS','REVIEWER','ADMIN'].indexOf(role)<0)throw new Error('Invalid role for '+email);
  if(!dept)throw new Error('Department is required for '+email);
  if(!options.allowFlexibleDepartment&&['BD','MKT','OPS','Other Entities'].indexOf(dept)<0)throw new Error('Invalid department for '+email+': '+dept);
  if(manager&&!corporateEmail_(manager))throw new Error('Invalid manager email for '+email);
  return {email:email,role:role,department:dept,managerEmail:manager};
}
function resolveTeamForUser_(department,teamName,autoCreate,parts){
  ensurePeopleSchema_();
  department=String(department||'').trim();teamName=peopleCleanOrgValue_(teamName)||'Unassigned';parts=parts||{};
  const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),table=loadTable_(ss,'Teams');
  let match=table.objects.find(function(t){return String(t.department||'').toLowerCase()===department.toLowerCase()&&String(t.team_name||'').toLowerCase()===teamName.toLowerCase();});
  if(match){let changed=false;if(parts.cluster&&!match.team_cluster){match.team_cluster=parts.cluster;changed=true;}if(parts.category&&!match.team_category){match.team_category=parts.category;changed=true;}if(parts.role&&!match.team_role){match.team_role=parts.role;changed=true;}if(changed){match.updated_at=new Date();writeTableObjects_(table);}return match;}
  if(!autoCreate)throw new Error('Team not found in Teams Master: '+department+' / '+teamName);
  const now=new Date(),key=department.toLowerCase()+'|'+teamName.toLowerCase();
  match={team_id:'TEAM-'+shortHash_(key,10).toUpperCase(),department:department,team_name:teamName,team_cluster:parts.cluster||'',team_category:parts.category||'',team_role:parts.role||'',status:'ACTIVE',manager_email:'',created_at:now,updated_at:now,approval_owner_email:'',pillar_lead_email:'',sort_order:''};
  table.objects.push(match);writeTableObjects_(table);return match;
}
function userRowsForPortal_(){
  ensurePeopleSchema_();
  const teams=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Teams'),map={};
  teams.forEach(function(t){map[String(t.team_id||'')]={department:t.department||'',team:t.team_name||'',teamCluster:t.team_cluster||'',teamCategory:t.team_category||'',teamRole:t.team_role||'',managerEmail:t.manager_email||''};});
  return readObjects_(PORTAL_DB_SPREADSHEET_ID,'Users').filter(function(u){return u.email||u.source_identity;}).map(function(u){
    const t=map[String(u.team_id||'')]||{};
    return {id:u.user_id||'',email:u.email||'',name:u.display_name||u.source_identity||u.email||'',displayName:u.display_name||'',role:u.role||'REQUESTER',status:u.status||'INACTIVE',active:String(u.status||'').toUpperCase()==='ACTIVE',department:t.department||'',team:t.team||'',teamCluster:t.teamCluster||'',teamCategory:t.teamCategory||'',teamRole:t.teamRole||'',teamId:u.team_id||'',managerEmail:u.manager_email||t.managerEmail||'',sourceIdentity:u.source_identity||'',totalRequests:Number(u.total_requests||0),identityStatus:u.identity_status||'',canReviewPn:String(u.can_review_pn||'').toUpperCase()==='TRUE',canReviewSc:String(u.can_review_sc||'').toUpperCase()==='TRUE',canReviewArtwork:String(u.can_review_artwork||'').toUpperCase()==='TRUE',canManageCycles:String(u.can_manage_cycles||'').toUpperCase()==='TRUE',canManageNotifications:String(u.can_manage_notifications||'').toUpperCase()==='TRUE'};
  });
}
function saveTeamMember(p,email){
  ensurePeopleSchema_();
  email=email||portalCurrentEmail_();assertPortalRoles_(email,['ADMIN']);
  const v=validateUserPayload_(p,{allowFlexibleDepartment:true}),team=resolveTeamForUser_(v.department,p.team||peopleTeamPathFromRow_(p),true,peopleTeamPartsFromRow_(p)),users=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Users'),existing=users.find(function(u){return String(u.email||'').toLowerCase()===v.email.toLowerCase();}),now=new Date();
  const fields={email:v.email,display_name:p.displayName||p.name||(existing&&existing.display_name)||'',team_id:team.team_id||'',role:v.role,status:p.active===false?'INACTIVE':'ACTIVE',manager_email:v.managerEmail||(existing&&existing.manager_email)||'',identity_status:(existing&&existing.identity_status)||'VERIFIED_EMAIL',updated_at:now,can_review_pn:boolText_(p.canReviewPn),can_review_sc:boolText_(p.canReviewSc),can_review_artwork:boolText_(p.canReviewArtwork),can_manage_cycles:boolText_(p.canManageCycles),can_manage_notifications:boolText_(p.canManageNotifications)};
  if(existing){const f=findRowById_('Users','user_id',existing.user_id);writeFields_(f,fields);}else{fields.user_id='USR-'+Utilities.getUuid();fields.source_identity=v.email;fields.created_at=now;appendByHeader_('Users',fields);}
  portalClearDataCache_();
  return userRowsForPortal_();
}
function massImportUsers(p,email){
  ensurePeopleSchema_();
  email=email||portalCurrentEmail_();assertPortalRoles_(email,['ADMIN']);
  return massImportUsersCore_(p,email);
}
function massImportUsersCore_(p,email){
  ensurePeopleSchema_();
  p=p||{};const rows=Array.isArray(p.rows)?p.rows:[],mode=String(p.mode||'UPSERT_BY_EMAIL').toUpperCase(),maxRows=2000;
  if(!rows.length)throw new Error('No import rows received.');
  if(rows.length>maxRows)throw new Error('Maximum '+maxRows+' users per import job.');
  if(['UPSERT_BY_EMAIL','SKIP_EXISTING'].indexOf(mode)<0)throw new Error('Invalid import mode.');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  const jobId='UIMP-'+Utilities.formatDate(new Date(),'Asia/Bangkok','yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,6).toUpperCase(),started=new Date();
  try{
    const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),usersTable=loadTable_(ss,'Users'),teamsTable=loadTable_(ss,'Teams');
    const byEmail={},teamMap={};
    usersTable.objects.forEach(function(u){if(u.email)byEmail[String(u.email).toLowerCase()]=u;});
    teamsTable.objects.forEach(function(t){teamMap[String(t.department||'').toLowerCase()+'|'+String(t.team_name||'').toLowerCase()]=t;});
    const seen={},prepared=[],validation=[];let teamsChanged=false;
    rows.forEach(function(r,i){
      const rowNumber=Number(r.sourceRowNumber||r.source_row_number||i+2);
      try{
        const v=validateUserPayload_(r,{allowFlexibleDepartment:true}),key=v.email.toLowerCase();
        if(seen[key])throw new Error('Duplicate email inside import file.');seen[key]=1;
        const active=peopleBool_(r.active,true),capabilities={pn:peopleBool_(r.canReviewPn!==undefined?r.canReviewPn:r.can_review_pn,false),sc:peopleBool_(r.canReviewSc!==undefined?r.canReviewSc:r.can_review_sc,false),artwork:peopleBool_(r.canReviewArtwork!==undefined?r.canReviewArtwork:r.can_review_artwork,false),cycles:peopleBool_(r.canManageCycles!==undefined?r.canManageCycles:r.can_manage_cycles,false),notifications:peopleBool_(r.canManageNotifications!==undefined?r.canManageNotifications:r.can_manage_notifications,false)};
        const teamName=peopleTeamPathFromRow_(r),parts=peopleTeamPartsFromRow_(r),teamKey=v.department.toLowerCase()+'|'+teamName.toLowerCase();
        let team=teamMap[teamKey];
        if(!team){
          if(p.autoCreateTeams===false)throw new Error('Team not found in Teams Master: '+v.department+' / '+teamName);
          const now=new Date();team={team_id:'TEAM-'+shortHash_(teamKey,10).toUpperCase(),department:v.department,team_name:teamName,team_cluster:parts.cluster,team_category:parts.category,team_role:parts.role,status:'ACTIVE',manager_email:'',created_at:now,updated_at:now,approval_owner_email:'',pillar_lead_email:'',sort_order:''};
          teamsTable.objects.push(team);teamMap[teamKey]=team;teamsChanged=true;
        }else{
          if(parts.cluster&&!team.team_cluster){team.team_cluster=parts.cluster;teamsChanged=true;}
          if(parts.category&&!team.team_category){team.team_category=parts.category;teamsChanged=true;}
          if(parts.role&&!team.team_role){team.team_role=parts.role;teamsChanged=true;}
        }
        const existing=byEmail[key]||null;
        prepared.push({row:r,rowNumber:rowNumber,v:v,team:team,existing:existing,active:active,capabilities:capabilities});
        validation.push({ok:true,rowNumber:rowNumber,email:v.email,existing:!!existing});
      }catch(err){validation.push({ok:false,rowNumber:rowNumber,email:String(r.email||''),error:String(err.message||err)});}
    });
    const errors=validation.filter(function(x){return !x.ok;});
    if(errors.length){
      const completedFail=new Date();
      appendObjects_(ss.getSheetByName('User_Import_Jobs'),[{import_job_id:jobId,file_name:p.fileName||'',import_mode:mode,total_rows:rows.length,valid_rows:rows.length-errors.length,inserted_rows:0,updated_rows:0,skipped_rows:0,error_rows:errors.length,status:'VALIDATION_FAILED',started_at:started,completed_at:completedFail,created_by:email,template_version:p.templateVersion||'1.0',notes:'No Users rows were changed because validation failed.'}]);
      appendObjects_(ss.getSheetByName('User_Import_Rows'),validation.map(function(v){return {import_row_id:'UIR-'+Utilities.getUuid(),import_job_id:jobId,source_row_number:v.rowNumber,email:v.email,validation_status:v.ok?'VALID':'ERROR',action_taken:'NONE',error_code:v.ok?'':'VALIDATION_ERROR',error_message:v.error||'',processed_at:completedFail};}));
      throw new Error('Import blocked: '+errors.length+' row(s) failed validation. No users were changed.');
    }
    let inserted=0,updated=0,skipped=0;const rowLogs=[];
    prepared.forEach(function(item){
      const r=item.row,v=item.v,existing=item.existing,now=new Date();
      const fields={email:v.email,display_name:r.displayName||r.display_name||(existing&&existing.display_name)||'',team_id:item.team.team_id||'',role:v.role,status:item.active?'ACTIVE':'INACTIVE',manager_email:v.managerEmail||(existing&&existing.manager_email)||'',identity_status:(existing&&existing.identity_status)||'VERIFIED_EMAIL',source_identity:(existing&&existing.source_identity)||v.email,updated_at:now,can_review_pn:boolText_(item.capabilities.pn),can_review_sc:boolText_(item.capabilities.sc),can_review_artwork:boolText_(item.capabilities.artwork),can_manage_cycles:boolText_(item.capabilities.cycles),can_manage_notifications:boolText_(item.capabilities.notifications)};
      let action='',resultId='';
      if(existing&&mode==='SKIP_EXISTING'){skipped++;action='SKIPPED_EXISTING';resultId=existing.user_id||'';}
      else if(existing){Object.keys(fields).forEach(function(k){existing[k]=fields[k];});updated++;action='UPDATED';resultId=existing.user_id||'';}
      else{fields.user_id='USR-'+Utilities.getUuid();fields.created_at=now;usersTable.objects.push(fields);byEmail[v.email.toLowerCase()]=fields;inserted++;action='INSERTED';resultId=fields.user_id;}
      rowLogs.push({import_row_id:'UIR-'+Utilities.getUuid(),import_job_id:jobId,source_row_number:item.rowNumber,email:v.email,display_name:fields.display_name,role:fields.role,department:v.department,team:item.team.team_name||'',team_id:fields.team_id,manager_email:fields.manager_email,active:fields.status==='ACTIVE',review_capabilities_json:JSON.stringify({pn:fields.can_review_pn,sc:fields.can_review_sc,artwork:fields.can_review_artwork,cycles:fields.can_manage_cycles,notifications:fields.can_manage_notifications}),validation_status:'VALID',action_taken:action,error_code:'',error_message:'',existing_user_id:existing?existing.user_id||'':'',result_user_id:resultId,processed_at:now});
    });
    if(teamsChanged)writeTableObjects_(teamsTable);
    writeTableObjects_(usersTable);
    const completed=new Date(),job={id:jobId,fileName:p.fileName||'',mode:mode,total:rows.length,valid:rows.length,inserted:inserted,updated:updated,skipped:skipped,errors:0,status:'COMPLETED',startedAt:started.toISOString(),completedAt:completed.toISOString(),createdBy:email,templateVersion:p.templateVersion||'1.0'};
    appendObjects_(ss.getSheetByName('User_Import_Jobs'),[{import_job_id:jobId,file_name:job.fileName,import_mode:mode,total_rows:rows.length,valid_rows:rows.length,inserted_rows:inserted,updated_rows:updated,skipped_rows:skipped,error_rows:0,status:'COMPLETED',started_at:started,completed_at:completed,created_by:email,template_version:job.templateVersion,notes:(p.source==='SETUP_SEED'?'Provided People & Roles setup seed.':'People & Roles mass import completed.')}]);
    appendObjects_(ss.getSheetByName('User_Import_Rows'),rowLogs);
    portalClearDataCache_();CacheService.getScriptCache().remove('portal_meta_live_v2');
    return {inserted:inserted,updated:updated,skipped:skipped,errors:0,job:job,teamMembers:userRowsForPortal_()};
  }finally{lock.releaseLock();}
}
function createPortalRequest_(p,email){
  const lock=LockService.getScriptLock();lock.waitLock(20000);
  try{
    ensurePortalCloseoutSchema_();
    const now=new Date(),id='REQ-'+Utilities.formatDate(now,'Asia/Bangkok','yyyyMMdd-HHmmss')+'-'+Utilities.getUuid().slice(0,6).toUpperCase();
    const urgent=String(p.requestType||p.commsType||'').toUpperCase().indexOf('URG')>=0,channels=Array.isArray(p.channels)?p.channels.filter(Boolean):[];
    const complete=!!(p.department&&p.team&&p.campaign&&p.startDate&&channels.length),status=urgent?'PENDING_MANAGER_APPROVAL':(complete?'READY_FOR_CUTOFF':'INCOMPLETE'),meta=getFormMetaV475_(Object.assign({},p,{urgent:urgent}));
    const row={request_id:id,requester_email:p.requestor||email,requester_name:p.requesterName||'',department:p.department||'',team_id:p.teamId||'',team_name_snapshot:p.team||'',campaign_name:p.campaign||'',status:status,priority:meta.priority.level,priority_score:meta.priority.score,campaign_grade_ts:meta.campaignGrade.ts,campaign_grade_ns:meta.campaignGrade.ns,objective:p.objective||p.objectiveType||'',business_impact:p.detail||p.scContent||'',start_date:p.startDate||'',end_date:p.endDate||p.startDate||'',seller_scope:p.sellerScope||'',seller_target:p.sellerTarget||'',target_criteria:p.targetCriteria||'',target_size:p.targetSize||'',compliance_required:p.compliance===true?'TRUE':'FALSE',monetary_risk:p.monetary===true?'TRUE':'FALSE',urgent_reason:p.urgencyReason||'',created_at:now,updated_at:now,created_by:email,request_type:urgent?'URGENT':'NORMAL',cycle_id:p.cycleId||'',completeness_status:complete?'COMPLETE':'INCOMPLETE',editable_until:p.editableUntil||'',manager_approval_status:urgent?'PENDING':'NOT_REQUIRED',manager_approver_email:p.directManager||'',preferred_time_slot:p.preferredTimeSlot||'NO_PREFERENCE',time_source:p.preferredTimeSlot&&p.preferredTimeSlot!=='NO_PREFERENCE'?'PORTAL_EXPLICIT':'NOT_SPECIFIED',source_system:'PORTAL_NATIVE'};
    appendByHeader_('Requests',row);
    channels.forEach(function(ch){appendByHeader_('Comms_Items',{comms_item_id:'COM-'+Utilities.getUuid(),request_id:id,channel_group:'PORTAL_NATIVE',module:'PORTAL_NATIVE',asset_type:ch,title:p.scTitle||p.campaign||'',key_message:p.scContent||p.detail||'',destination_url:p.destinationUrl||'',owner_email:'',reviewer_email:'',approver_email:'',status:'DRAFT',scheduled_at:'',published_at:'',artwork_url:p.artworkUrl||'',current_version:1,created_at:now,updated_at:now});});
    appendByHeader_('Ticket_Events',{event_id:'EVT-'+Utilities.getUuid(),request_id:id,event_type:'REQUEST_CREATED',from_status:'',to_status:status,actor_email:email,created_at:now,metadata_json:JSON.stringify({channels:channels,requestType:row.request_type})});
    portalClearDataCache_();return {id:id,status:status,complete:complete};
  } finally { lock.releaseLock(); }
}
function updatePortalRequest_(p,email){
  ensurePortalCloseoutSchema_();const f=findRowById_('Requests','request_id',p.id);if(!f)throw new Error('Request not found.');
  const req=portalRequestRow_(p.id)||{},next=String(p.status||'').toUpperCase();
  if(next==='PUBLISHED'||next==='COMPLETED'){const links=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Tracking_Links').filter(function(x){return String(x.request_id||'')===String(p.id||'')&&String(x.status||'').toUpperCase().indexOf('ACTIVE')>=0;});if(!links.length)throw new Error('Smart Link gate: create an active Tracking Link before Portal-native Published.');}
  const input=p.fields||{},fields={updated_at:new Date()};
  if(Object.prototype.hasOwnProperty.call(input,'campaign'))fields.campaign_name=input.campaign;
  if(Object.prototype.hasOwnProperty.call(input,'objective'))fields.objective=input.objective;
  if(Object.prototype.hasOwnProperty.call(input,'startDate')){fields.start_date=input.startDate;if(!req.end_date||String(req.end_date)===String(req.start_date))fields.end_date=input.startDate;}
  if(Object.prototype.hasOwnProperty.call(input,'detail'))fields.business_impact=input.detail;
  if(p.status){if(String(req.source_system||'').toUpperCase()==='PORTAL_NATIVE')fields.status=p.status;else fields.portal_workflow_status=p.status;}
  writeFields_(f,fields);
  const items=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Comms_Items').filter(function(x){return String(x.request_id||'')===String(p.id||'');});
  items.forEach(function(item){const fi=findRowById_('Comms_Items','comms_item_id',item.comms_item_id),ifields={updated_at:new Date()};if(Object.prototype.hasOwnProperty.call(input,'destinationUrl'))ifields.destination_url=input.destinationUrl;if(Object.prototype.hasOwnProperty.call(input,'detail'))ifields.key_message=input.detail;if(Object.prototype.hasOwnProperty.call(input,'campaign')&&!item.title)ifields.title=input.campaign;writeFields_(fi,ifields);});
  appendByHeader_('Ticket_Events',{event_id:'EVT-'+Utilities.getUuid(),request_id:p.id,event_type:p.status==='RESUBMITTED'?'REVISION_SUBMITTED':'REQUEST_UPDATED',actor_email:email,to_status:p.status||'',created_at:new Date(),metadata_json:JSON.stringify({fields:Object.keys(input),comment:p.note||''})});portalClearDataCache_();return {id:p.id,status:p.status||req.status||''};
}
function saveReviewDecision_(p,email){const f=findRowById_('Requests','request_id',p.requestId);if(!f)throw new Error('Request not found.');const req=portalRequestRow_(p.requestId)||{},decision=String(p.decision||'').toUpperCase(),next=decision==='APPROVE'?(p.finalStage?'FINALIST':'IN_REVIEW'):decision==='NEED_REVISED'?'NEED_REVISED':'REJECTED',now=new Date(),revisionFields=Array.isArray(p.revisionFields)?p.revisionFields:[];writeFields_(f,String(req.source_system||'').toUpperCase()==='PORTAL_NATIVE'?{status:next,revision_due_at:p.revisionDueAt||'',updated_at:now}:{portal_workflow_status:next,revision_due_at:p.revisionDueAt||'',updated_at:now});appendByHeader_('Review_Tasks',{review_task_id:'RT-'+Utilities.getUuid(),request_id:p.requestId,reviewer_email:email,review_type:p.reviewLayer||'COMMS_REVIEW',review_status:decision==='NEED_REVISED'?'NEED_REVISED':decision,assigned_at:now,due_at:p.dueAt||'',decision_at:now,decision:decision,cycle_id:p.cycleId||'',review_layer:p.reviewLayer||'COMMS_REVIEW',reviewer_capability:p.reviewerCapability||'',revision_fields_json:JSON.stringify(revisionFields),revision_due_at:p.revisionDueAt||'',request_version:Number(p.requestVersion||1),status_before:p.statusBefore||'',status_after:next,updated_at:now});appendByHeader_('Ticket_Events',{event_id:'EVT-'+Utilities.getUuid(),request_id:p.requestId,event_type:decision,from_status:p.statusBefore||'',to_status:next,actor_email:email,created_at:now,metadata_json:JSON.stringify({comment:p.comment||'',revisionFields:revisionFields})});if(decision==='NEED_REVISED')notifyNeedRevised_(p.requestId,p.comment||'',p.revisionDueAt||'');portalClearDataCache_();return {requestId:p.requestId,status:next};}
function notifyNeedRevised_(requestId,comment,due){const req=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').find(r=>r.request_id===requestId);if(!req||!req.requester_email)return;const email=req.requester_email;if(!/@shopee\.com$|@shopeemobile-external\.com$/i.test(email))return;MailApp.sendEmail({to:email,subject:'Action required: your communication request needs revision',htmlBody:'<p>A reviewer requested changes to <strong>'+escapeHtml_(req.campaign_name||requestId)+'</strong>.</p><p>'+escapeHtml_(comment)+'</p><p>Revision due: '+escapeHtml_(due||'Please check the Portal')+'</p>'});appendByHeader_('Notification_Log',{notification_id:'NTF-'+Utilities.getUuid(),event_type:'NEED_REVISED',request_id:requestId,recipient_email:email,delivery_channel:'EMAIL+PORTAL',status:'SENT',sent_at:new Date(),dedupe_key:'NEED_REVISED|'+requestId+'|'+new Date().getTime(),created_at:new Date()});}
function saveCycleRule(p,email){
  email=email||portalCurrentEmail_();assertPortalRoles_(email,['ADMIN','COMMS']);
  const allFuture=p.scope==='ALL_FUTURE';if(allFuture){const f=findRowById_('Cycle_Rules','rule_id',p.id);if(!f)throw new Error('Cycle rule not found.');writeFields_(f,{cutoff_weekday:String(p.cutoffWeekday||'').toUpperCase(),cutoff_time:p.cutoffTime||'',reminder_offsets_hours:p.reminders||'',default_finalist_weekday:p.finalist?String(p.finalist).split(/\s+/)[0].toUpperCase():'',default_finalist_time:p.finalist?String(p.finalist).split(/\s+/)[1]||'':'',version:Number(readCellByHeader_(f,'version')||0)+1,updated_at:new Date(),updated_by:email});appendConfigHistory_('CYCLE_RULE',p.id,'','ALL_FUTURE',email,p);}
  else {const cycles=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Communication_Cycles'),rule=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Cycle_Rules').find(r=>r.rule_id===p.id),c=cycles.find(x=>x.cycle_rule_id===p.id&&x.status==='OPEN');if(!c||!rule)throw new Error('Upcoming open cycle not found.');const f=findRowById_('Communication_Cycles','cycle_id',c.cycle_id),cutoff=overrideCutoff_(c.cutoff_at,p.cutoffWeekday,p.cutoffTime);writeFields_(f,{cutoff_at:cutoff,override_scope:'NEXT_ONLY',override_json:JSON.stringify(p),updated_at:new Date(),updated_by:email});appendConfigHistory_('CYCLE_OVERRIDE',c.cycle_id,'','NEXT_ONLY',email,p);}
  portalClearDataCache_();return {saved:true,scope:p.scope};
}
function readCellByHeader_(found,h){const c=found.headers.indexOf(h);return c>=0?found.sheet.getRange(found.row,c+1).getValue():'';}
function overrideCutoff_(existing,weekday,time){const base=new Date(String(existing).replace(' ','T')+'+07:00');if(isNaN(base))return existing;const map={SUNDAY:0,MONDAY:1,TUESDAY:2,WEDNESDAY:3,THURSDAY:4,FRIDAY:5,SATURDAY:6},target=map[String(weekday||'').toUpperCase()];if(target!==undefined)base.setDate(base.getDate()+target-base.getDay());const parts=String(time||'').split(':');if(parts.length>=2)base.setHours(Number(parts[0]),Number(parts[1]),0,0);return Utilities.formatDate(base,'Asia/Bangkok','yyyy-MM-dd HH:mm:ss');}
function appendConfigHistory_(scope,key,oldVal,newVal,email,meta){appendByHeader_('Config_History',{history_id:'HIST-'+Utilities.getUuid(),config_scope:scope,config_key:key,old_value:oldVal,new_value:newVal,changed_at:new Date(),changed_by:email,change_reason:'Portal configuration update',metadata_json:JSON.stringify(meta)});}
function ensureSmartLinkSchema_(){
  const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID);
  // DATA-SAFE: schema self-heal appends missing columns only. It never clears, truncates, or replaces existing Smart Link rows.
  ensureSheetColumns_(ss,'Tracking_Links',['tracking_id','request_id','comms_item_id','tracking_version','original_url','generated_url','short_url','status','created_at','created_by','link_type','utm_source','utm_medium','utm_campaign','utm_content','utm_term','custom_params_json','external_server_url','external_reference_id','external_source_url','updated_at']);
  ensureSheetColumns_(ss,'Short_Link_Routes',['short_code','tracking_id','destination_url','short_url','status','route_version','click_count','created_at','created_by','updated_at','last_clicked_at','legacy_param_policy','destination_hash','notes','metadata_json']);
  return true;
}
function createSmartLinkRecord_(p,email){
  ensureSmartLinkSchema_();
  const customParams=parseCustomParams_(p.customParams);
  const finalUrl=buildTrackedUrl_(String(p.destination||p.originalUrl||''),{utm_source:p.source,utm_medium:p.medium,utm_campaign:p.campaign,utm_content:p.content,utm_term:p.term},customParams);
  const id='TRK-'+Utilities.getUuid();
  const external=String(p.linkType||'PORTAL').toUpperCase()==='EXTERNAL';
  const wantShort=String(p.shorten||'true').toLowerCase()!=='false';
  const aliasMode=String(p.aliasMode||'AUTO').toUpperCase();
  const customAlias=aliasMode==='CUSTOM'?String(p.customAlias||'').trim():'';
  if(customAlias&&!/^[A-Za-z0-9-]+$/.test(customAlias))throw new Error('Custom Alias may contain letters, numbers and dashes only.');

  let shortUrl='',shortProvider='',shortStatus='TRACKING_ONLY';
  if(wantShort){
    shortProvider='TINYURL_FREE';
    const result=createTinyUrlFree_(finalUrl,customAlias);
    shortUrl=result.shortUrl||'';shortStatus=result.status||'';
    // New records requested as short links are fail-closed: never save another incomplete/preview-only row.
    if(!shortUrl)throw new Error(tinyUrlUserMessage_(shortStatus));
  }
  const status=external?'READY_FOR_EXTERNAL_SERVER':'ACTIVE';
  appendByHeader_('Tracking_Links',{tracking_id:id,request_id:p.requestId||'',comms_item_id:p.commsItemId||'',tracking_version:1,original_url:p.destination||'',generated_url:finalUrl,short_url:shortUrl,status:status,created_at:new Date(),created_by:email,link_type:external?'EXTERNAL':(wantShort?'TINYURL_FREE':'PORTAL'),utm_source:p.source||'',utm_medium:p.medium||'',utm_campaign:p.campaign||'',utm_content:p.content||'',utm_term:p.term||'',custom_params_json:JSON.stringify(customParams),external_server_url:'',external_reference_id:customAlias||'',external_source_url:external?(p.destination||''):'',updated_at:new Date()});
  if(shortUrl)appendShortLinkRoute_(id,shortUrl,finalUrl,customAlias,email,shortStatus);
  if(p.requestId)appendByHeader_('Ticket_Events',{event_id:'EVT-'+Utilities.getUuid(),request_id:p.requestId,event_type:'SMART_LINK_READY',from_status:'',to_status:'PRE_PUBLISH_LINK_READY',actor_email:email,created_at:new Date(),metadata_json:JSON.stringify({trackingId:id,shortUrl:shortUrl||'',generatedUrl:finalUrl,shortStatus:shortStatus})});
  return {code:id,trackingId:id,requestId:p.requestId||'',generatedUrl:finalUrl,shortUrl:shortUrl,shortProvider:shortProvider,status:status,shortStatus:shortStatus,customAlias:customAlias,aliasFallback:shortStatus==='CREATED_AUTO_FALLBACK'};
}
function parseCustomParams_(value){
  if(!value)return{};
  if(typeof value==='object'&&!Array.isArray(value))return value;
  const out={};
  String(value).split(/\r?\n/).forEach(function(line){const i=line.indexOf('=');if(i<=0)return;const k=line.slice(0,i).trim(),v=line.slice(i+1).trim();if(k&&k.toLowerCase()!=='legacy')out[k]=v;});
  return out;
}
function tinyUrlToken_(){return String(PropertiesService.getScriptProperties().getProperty('TINYURL_API_TOKEN')||'').trim();}
function tinyUrlUserMessage_(status){
  status=String(status||'');
  if(status==='TOKEN_NOT_CONFIGURED')return 'TinyURL is not connected yet. Open Smart Links > Connect TinyURL, paste the Free API token once, then retry. No preview-only row was saved.';
  if(/^HTTP_401|^HTTP_403/.test(status))return 'TinyURL rejected the API token or Create TinyURL permission is missing. Reconnect the token in Smart Links and retry. No incomplete row was saved.';
  if(/^HTTP_429/.test(status))return 'TinyURL rate limit was reached. Retry shortly. The Portal did not save an incomplete short-link row.';
  return 'TinyURL could not create the short URL ('+status+'). The Portal kept existing data unchanged and did not save an incomplete new row.';
}
function tinyUrlErrorMessage_(body,code,text){
  if(body&&Array.isArray(body.errors)&&body.errors.length)return body.errors.map(function(x){return String((x&&x.message)||x||'');}).filter(Boolean).join('; ');
  if(body&&body.message)return String(body.message);
  return String(text||('HTTP '+code)).slice(0,300);
}
function tinyUrlAliasConflict_(status,message){
  const s=(String(status||'')+' '+String(message||'')).toLowerCase();
  return /alias/.test(s)&&/(already|exist|taken|unavailable|used|unique|reserved)/.test(s);
}
function tinyUrlRequest_(destination,alias){
  const token=tinyUrlToken_();
  if(!token)return {shortUrl:'',status:'TOKEN_NOT_CONFIGURED',message:'Token not configured'};
  const payload={url:destination,domain:'tinyurl.com'};if(alias)payload.alias=alias;
  let last={shortUrl:'',status:'API_ERROR',message:'Unknown TinyURL error'};
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const response=UrlFetchApp.fetch('https://api.tinyurl.com/create',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+token,Accept:'application/json'},payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:true});
      const code=response.getResponseCode(),text=response.getContentText();let body={};try{body=JSON.parse(text||'{}');}catch(ignore){}
      if(code>=200&&code<300&&body&&body.data&&body.data.tiny_url)return {shortUrl:String(body.data.tiny_url),status:alias?'CREATED_CUSTOM':'CREATED_AUTO',httpStatus:code,message:''};
      const message=tinyUrlErrorMessage_(body,code,text);last={shortUrl:'',status:'HTTP_'+code,message:message,httpStatus:code};
      if(!(code===429||code>=500))return last;
      if(attempt<3)Utilities.sleep(attempt*700);
    }catch(err){last={shortUrl:'',status:'NETWORK_ERROR',message:String(err&&err.message?err.message:err)};if(attempt<3)Utilities.sleep(attempt*700);}
  }
  return last;
}
function createTinyUrlFree_(destination,customAlias){
  if(!tinyUrlToken_())return {shortUrl:'',status:'TOKEN_NOT_CONFIGURED'};
  const first=tinyUrlRequest_(destination,customAlias||'');
  if(first.shortUrl)return first;
  // A requested custom alias can legitimately already be owned. Fall back to TinyURL auto-alias so the user still gets a working short URL.
  if(customAlias&&tinyUrlAliasConflict_(first.status,first.message)){
    const fallback=tinyUrlRequest_(destination,'');
    if(fallback.shortUrl)return {shortUrl:fallback.shortUrl,status:'CREATED_AUTO_FALLBACK',requestedAlias:customAlias,message:first.message||''};
    return fallback;
  }
  return first;
}
function appendShortLinkRoute_(trackingId,shortUrl,destination,customAlias,email,shortStatus){
  try{
    ensureSmartLinkSchema_();
    const existing=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Short_Link_Routes').find(function(r){return String(r.tracking_id||'')===String(trackingId||'')||String(r.short_url||'')===String(shortUrl||'');});
    if(existing)return existing;
    const code=shortUrl.split('/').filter(Boolean).pop()||customAlias||'';
    appendByHeader_('Short_Link_Routes',{short_code:code,tracking_id:trackingId,destination_url:destination,short_url:shortUrl,status:'ACTIVE',route_version:1,click_count:'',created_at:new Date(),created_by:email,updated_at:new Date(),last_clicked_at:'',legacy_param_policy:'STRIP_EXACT_LEGACY',destination_hash:Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,destination)).slice(0,24),notes:'TinyURL Free route. Detailed click analytics are not assumed on Free tier.',metadata_json:JSON.stringify({provider:'TINYURL_FREE',customAlias:customAlias||'',shortStatus:shortStatus||''})});
  }catch(ignore){}
}
function smartLinkProviderStatus_(p,email){
  assertPortalRoles_(email,['ADMIN','COMMS']);ensureSmartLinkSchema_();
  const rows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Tracking_Links');
  const pending=rows.filter(function(r){const generated=String(r.generated_url||'').trim(),shortUrl=String(r.short_url||'').trim(),type=String(r.link_type||'').toUpperCase(),status=String(r.status||'').toUpperCase();return generated&&!shortUrl&&(type==='TINYURL_FREE'||status==='ACTIVE_TRACKING_ONLY'||status.indexOf('PREVIEW')>=0);});
  return {configured:!!tinyUrlToken_(),provider:'TINYURL',mode:'FREE_API',existingLinks:rows.length,shortLinks:rows.filter(function(r){return !!String(r.short_url||'').trim();}).length,pendingBackfill:pending.length,dataSafety:'PRESERVE_EXISTING_ROWS',checkedAt:new Date().toISOString()};
}
function configureTinyUrlProvider_(p,email){
  assertPortalRoles_(email,['ADMIN']);
  const token=String((p||{}).token||'').trim();if(token.length<20)throw new Error('Paste a valid TinyURL API token. The token is stored only in Apps Script Script Properties.');
  PropertiesService.getScriptProperties().setProperty('TINYURL_API_TOKEN',token);
  const repaired=repairExistingSmartLinks_({limit:Number((p||{}).limit||50),configuredInThisCall:true},email);
  const status=smartLinkProviderStatus_({},email);status.repair=repaired;return status;
}
function repairExistingSmartLinks_(p,email){
  assertPortalRoles_(email,['ADMIN','COMMS']);ensureSmartLinkSchema_();
  if(!tinyUrlToken_())throw new Error('TinyURL is not connected. Admin must use Connect TinyURL first. Existing Smart Link rows were not changed.');
  const limit=Math.max(1,Math.min(100,Number((p||{}).limit||50))),rows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Tracking_Links');
  const pending=rows.filter(function(r){const generated=String(r.generated_url||'').trim(),shortUrl=String(r.short_url||'').trim(),type=String(r.link_type||'').toUpperCase(),status=String(r.status||'').toUpperCase();return generated&&!shortUrl&&(type==='TINYURL_FREE'||status==='ACTIVE_TRACKING_ONLY'||status.indexOf('PREVIEW')>=0);}).slice(0,limit);
  const results=[];
  pending.forEach(function(r){
    const trackingId=String(r.tracking_id||'').trim(),destination=String(r.generated_url||'').trim(),requestedAlias=String(r.external_reference_id||'').trim();
    const result=createTinyUrlFree_(destination,requestedAlias);
    if(!result.shortUrl){results.push({trackingId:trackingId,ok:false,status:result.status||'FAILED'});return;}
    const found=findRowById_('Tracking_Links','tracking_id',trackingId);if(!found){results.push({trackingId:trackingId,ok:false,status:'ROW_NOT_FOUND'});return;}
    const previousStatus=String(r.status||'');
    const nextStatus=(/ACTIVE_TRACKING_ONLY|PREVIEW/i.test(previousStatus)||!previousStatus)?'ACTIVE':previousStatus;
    // DATA-SAFE repair: update ONLY short_url/status/updated_at. UTM, destination, IDs, aliases and created metadata remain byte-for-byte untouched.
    writeFields_(found,{short_url:result.shortUrl,status:nextStatus,updated_at:new Date()});
    appendShortLinkRoute_(trackingId,result.shortUrl,destination,requestedAlias,email,result.status||'');
    if(r.request_id)appendByHeader_('Ticket_Events',{event_id:'EVT-'+Utilities.getUuid(),request_id:r.request_id,event_type:'SMART_LINK_SHORTENER_REPAIRED',from_status:previousStatus,to_status:nextStatus,actor_email:email,created_at:new Date(),metadata_json:JSON.stringify({trackingId:trackingId,shortUrl:result.shortUrl,shortStatus:result.status||''})});
    results.push({trackingId:trackingId,ok:true,shortUrl:result.shortUrl,status:result.status||'CREATED'});
  });
  portalClearDataCache_();
  return {attempted:pending.length,repaired:results.filter(function(x){return x.ok;}).length,failed:results.filter(function(x){return !x.ok;}).length,results:results,dataSafety:'NO_ROWS_DELETED_NO_UTM_REWRITTEN'};
}


function ensureContentOpsSchema_(){
  const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID);
  ensureSheetColumns_(ss,'Content_AI_Insights',['insight_id','request_id','context_summary','objective_summary','tone_vibes','target_summary','benefit_summary','keyword_suggestions','analysis_mode','model_ref','created_at','updated_at','created_by','raw_response_json']);
  ensureSheetColumns_(ss,'Attachments',['attachment_id','request_id','comms_item_id','file_name','drive_file_id','file_url','mime_type','file_size_bytes','image_width','image_height','asset_type','validation_status','validation_message','created_at','created_by']);
  return true;
}
function contentFallback_(p){
  const text=[p.campaign,p.objective,p.detail,p.title].filter(Boolean).join(' · '),lower=text.toLowerCase();
  let tone='Informative / Clear';if(/urgent|deadline|last chance|ด่วน|ภายใน/i.test(text))tone='Urgent / Action-oriented';else if(/reward|free|discount|voucher|coin|credit|สิทธิ|รับฟรี|ลด/i.test(text))tone='Promotional / Benefit-led';else if(/policy|compliance|required|mandatory|ข้อกำหนด/i.test(text))tone='Formal / Compliance';
  const benefit=[];if(/free|reward|voucher|coin|credit|ฟรี/i.test(lower))benefit.push('Reward / cost benefit');if(/sale|sales|gmv|ยอดขาย|order/i.test(lower))benefit.push('Sales / conversion');if(/visibility|traffic|มองเห็น/i.test(lower))benefit.push('Visibility / traffic');if(!benefit.length)benefit.push('Seller action / awareness');
  const words=(text.match(/[A-Za-z][A-Za-z0-9+-]{2,}|[ก-๙]{3,}/g)||[]),seen={},keywords=[];words.forEach(function(w){const k=w.toLowerCase();if(!seen[k]&&keywords.length<8){seen[k]=1;keywords.push(w);}});
  return {requestId:p.requestId||'',context:String(p.detail||p.objective||p.campaign||'').slice(0,220),objective:p.objective||'Inform / drive seller action',tone:tone,target:p.targetCriteria||p.sellerScope||'Target not specified',benefit:benefit.join(' · '),keywords:keywords,mode:'STRUCTURED_FALLBACK',modelRef:'NONE'};
}
function analyzeContent(p,email){
  email=email||portalCurrentEmail_();
  assertPortalRoles_(email,['ADMIN','COMMS']);ensureContentOpsSchema_();let result=null,raw='';const endpoint=PropertiesService.getScriptProperties().getProperty('PORTAL_AI_ENDPOINT');
  if(endpoint){
    try{const response=UrlFetchApp.fetch(endpoint,{method:'post',contentType:'application/json',payload:JSON.stringify({task:'seller_comms_content_intelligence',input:{campaign:p.campaign||'',objective:p.objective||'',context:p.detail||'',title:p.title||'',sellerScope:p.sellerScope||'',targetCriteria:p.targetCriteria||'',assetType:p.assetType||''},outputSchema:{context:'string',objective:'string',tone:'string',target:'string',benefit:'string',keywords:'string[]'}}),muteHttpExceptions:true});if(response.getResponseCode()>=200&&response.getResponseCode()<300){raw=response.getContentText();const parsed=JSON.parse(raw||'{}'),x=parsed.data||parsed;result={requestId:p.requestId||'',context:x.context||'',objective:x.objective||'',tone:x.tone||x.toneVibes||'',target:x.target||'',benefit:x.benefit||'',keywords:Array.isArray(x.keywords)?x.keywords:[],mode:'WORKSPACE_AI',modelRef:parsed.model||'APPROVED_WORKSPACE_ENDPOINT'};}}
    catch(err){raw=String(err&&err.message?err.message:err);}
  }
  if(!result)result=contentFallback_(p);
  const existing=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Content_AI_Insights').find(function(x){return String(x.request_id||'')===String(p.requestId||'');}),now=new Date(),obj={request_id:p.requestId||'',context_summary:result.context||'',objective_summary:result.objective||'',tone_vibes:result.tone||'',target_summary:result.target||'',benefit_summary:result.benefit||'',keyword_suggestions:(result.keywords||[]).join('|'),analysis_mode:result.mode||'',model_ref:result.modelRef||'',updated_at:now,created_by:email,raw_response_json:raw};
  if(existing){const f=findRowById_('Content_AI_Insights','insight_id',existing.insight_id);writeFields_(f,obj);}else{obj.insight_id='AI-'+Utilities.getUuid();obj.created_at=now;appendByHeader_('Content_AI_Insights',obj);}
  portalClearDataCache_();return result;
}
function uploadArtwork(p,email){
  email=email||portalCurrentEmail_();
  assertRequestWriteAccess_(email,p&&p.requestId,false);ensureContentOpsSchema_();if(!p||!p.base64)throw new Error('Artwork file is required.');const mime=String(p.mimeType||'');if(['image/png','image/jpeg','image/webp'].indexOf(mime)<0)throw new Error('Artwork must be PNG, JPG/JPEG or WebP.');const bytes=Utilities.base64Decode(String(p.base64));if(bytes.length>8*1024*1024)throw new Error('Artwork exceeds the current 8 MB technical upload limit.');
  const props=PropertiesService.getScriptProperties();let folderId=props.getProperty('PORTAL_ARTWORK_FOLDER_ID'),folder=null;if(folderId){try{folder=DriveApp.getFolderById(folderId);}catch(ignore){folder=null;}}if(!folder){folder=DriveApp.createFolder('Seller Communication Portal Artwork');props.setProperty('PORTAL_ARTWORK_FOLDER_ID',folder.getId());}
  const safeName=String(p.fileName||('artwork-'+new Date().getTime())).replace(/[\\/:*?"<>|]+/g,'_'),blob=Utilities.newBlob(bytes,mime,safeName),file=folder.createFile(blob),url=file.getUrl(),attId='ATT-'+Utilities.getUuid();
  appendByHeader_('Attachments',{attachment_id:attId,request_id:p.requestId||'',comms_item_id:p.commsItemId||'',file_name:safeName,drive_file_id:file.getId(),file_url:url,mime_type:mime,file_size_bytes:bytes.length,image_width:Number(p.width||0),image_height:Number(p.height||0),asset_type:p.assetType||'',validation_status:p.validationStatus||'',validation_message:p.validationMessage||'',created_at:new Date(),created_by:email});
  if(p.requestId){const items=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Comms_Items').filter(function(x){return String(x.request_id||'')===String(p.requestId);});if(items.length){const selected=items.find(function(x){return String(x.asset_type||'')===String(p.assetType||'');})||items[0],f=findRowById_('Comms_Items','comms_item_id',selected.comms_item_id);writeFields_(f,{artwork_url:url,updated_at:new Date()});}appendByHeader_('Ticket_Events',{event_id:'EVT-'+Utilities.getUuid(),request_id:p.requestId,event_type:'ARTWORK_UPLOADED',actor_email:email,created_at:new Date(),metadata_json:JSON.stringify({attachmentId:attId,fileId:file.getId(),assetType:p.assetType||'',width:Number(p.width||0),height:Number(p.height||0),validationStatus:p.validationStatus||''})});}
  portalClearDataCache_();return {attachmentId:attId,fileId:file.getId(),url:url,fileName:safeName,size:bytes.length,width:Number(p.width||0),height:Number(p.height||0),validationStatus:p.validationStatus||''};
}

function buildTrackedUrl_(raw,utm,custom){if(!/^https?:\/\//i.test(raw))throw new Error('Valid http/https URL required.');const hashIndex=raw.indexOf('#'),hash=hashIndex>=0?raw.slice(hashIndex):'',baseWithQuery=hashIndex>=0?raw.slice(0,hashIndex):raw,qIndex=baseWithQuery.indexOf('?'),base=qIndex>=0?baseWithQuery.slice(0,qIndex):baseWithQuery,query=qIndex>=0?baseWithQuery.slice(qIndex+1):'',map={};query.split('&').filter(Boolean).forEach(pair=>{const i=pair.indexOf('=');const k=decodeURIComponent(i>=0?pair.slice(0,i):pair),v=decodeURIComponent(i>=0?pair.slice(i+1):'');map[k]=v;});Object.keys(map).filter(k=>String(k).toLowerCase()==='legacy').forEach(k=>delete map[k]);Object.keys(utm||{}).forEach(k=>{if(utm[k]!==undefined&&utm[k]!==null&&String(utm[k]).trim())map[k]=String(utm[k]).trim();});if(Array.isArray(custom)){custom.forEach(x=>{if(x&&x.key&&String(x.key).toLowerCase()!=='legacy')map[String(x.key)]=String(x.value||'')});}else Object.keys(custom||{}).forEach(k=>{if(String(k).toLowerCase()!=='legacy')map[k]=String(custom[k]||'')});Object.keys(map).filter(k=>String(k).toLowerCase()==='legacy').forEach(k=>delete map[k]);const qs=Object.keys(map).map(k=>encodeURIComponent(k)+'='+encodeURIComponent(map[k])).join('&');return base+(qs?'?'+qs:'')+hash;}

function installPortalAutomatedTriggers_() {
  const existing = ScriptApp.getProjectTriggers();
  existing.forEach(function(t){
    const fn = t.getHandlerFunction();
    if (fn === 'runPortalLiveSync' || fn === 'runPortalLiveSyncTrigger' || fn === 'runCycleEngine') {
      try { ScriptApp.deleteTrigger(t); } catch(ignore) {}
    }
  });
  ScriptApp.newTrigger('runPortalLiveSync')
    .timeBased()
    .everyMinutes(5)
    .create();
  ScriptApp.newTrigger('runCycleEngine')
    .timeBased()
    .everyMinutes(15)
    .create();
  return { ok: true, message: 'Automated triggers installed: runPortalLiveSync (5 min), runCycleEngine (15 min).' };
}
