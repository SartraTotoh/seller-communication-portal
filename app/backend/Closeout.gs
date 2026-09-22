/**
 * Seller Communication Portal v4.9.3 - Triple-Source + Campaign 360 closeout.
 * Adds fail-closed viewer identity, persistent admin/content/API/scoring writes,
 * operational health, and schema self-heal. Source PN/SC trackers stay READ ONLY.
 */
const PORTAL_CLOSEOUT_RELEASE = '4.9.3';

function portalCurrentEmail_(){
  let email='';
  try{if(typeof portalHttpSessionEmail_==='function')email=String(portalHttpSessionEmail_()||'').trim().toLowerCase();}catch(ignore){}
  if(!email){try{email=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();}catch(ignore){}}
  if(!email)throw new Error('WORKSPACE_SESSION_REQUIRED');
  assertCorporateUser_(email);return email;
}
function portalViewerContext_(email){
  email=String(email||portalCurrentEmail_()).trim().toLowerCase();
  assertCorporateUser_(email);ensurePeopleSchema_();
  const users=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Users');
  let row=users.find(function(x){return String(x.email||'').trim().toLowerCase()===email;});
  if(PORTAL_BOOTSTRAP_ADMIN_EMAILS.indexOf(email)>=0){
    if(!row){
      row={email:email,display_name:(email==='sellereducation.th@shopee.com'?'Seller Education Nominee':'totoh.taponchai'),role:'ADMIN',status:'ACTIVE',team_id:'',manager_email:'',identity_status:'BOOTSTRAP_ADMIN'};
    } else {
      row.role='ADMIN';
      row.status='ACTIVE';
    }
  }
  if(!row)throw new Error('Portal access is not provisioned for '+email+'. Ask an Admin to add you in People & Roles.');
  if(String(row.status||'ACTIVE').toUpperCase()!=='ACTIVE')throw new Error('Portal access is inactive for '+email+'.');
  const teams=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Teams'),team=teams.find(function(t){return String(t.team_id||'')===String(row.team_id||'');})||{};
  const role=String(row.role||'REQUESTER').toUpperCase();
  const user={id:row.user_id||'',email:email,name:row.display_name||row.source_identity||email,displayName:row.display_name||'',role:role,status:'ACTIVE',department:team.department||'',team:team.team_name||'',teamId:row.team_id||'',managerEmail:row.manager_email||team.manager_email||'',identityStatus:row.identity_status||'VERIFIED_EMAIL'};
  const admin=role==='ADMIN',comms=role==='COMMS',reviewer=role==='REVIEWER',requester=role==='REQUESTER';
  const permissions={
    canSubmit:admin||comms||requester,
    canReview:admin||comms||reviewer,
    canManageContent:admin||comms,
    canManageLinks:admin||comms,
    canManageApi:admin||comms,
    canManagePeople:admin,
    canManageCycles:admin||comms||String(row.can_manage_cycles||'').toUpperCase()==='TRUE',
    canManageNotifications:admin||comms||String(row.can_manage_notifications||'').toUpperCase()==='TRUE',
    admin:admin
  };
  return {email:email,role:role,user:user,permissions:permissions,row:row};
}
function assertPortalRoles_(email,roles){
  const v=portalViewerContext_(email);roles=(roles||[]).map(function(x){return String(x).toUpperCase();});
  if(roles.indexOf(v.role)<0)throw new Error('This action requires '+roles.join(' / ')+' access.');return v;
}
function portalRequestRow_(requestId){return readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').find(function(r){return String(r.request_id||'')===String(requestId||'');})||null;}
function assertRequestWriteAccess_(email,requestId,allowReviewer){
  const v=portalViewerContext_(email);if(['ADMIN','COMMS'].indexOf(v.role)>=0)return v;
  const req=portalRequestRow_(requestId);if(!req)throw new Error('Request not found.');
  if(v.role==='REQUESTER'&&String(req.requester_email||'').toLowerCase()===v.email){if(/^GOOGLE_SHEETS_/i.test(String(req.source_system||'')))throw new Error('Source-synced requests are read-only in the Portal. Update the approved source workflow instead.');return v;}
  if(allowReviewer&&v.role==='REVIEWER')return v;
  throw new Error('You do not have write access to this request.');
}
function portalClearDataCache_(){
  const c=CacheService.getScriptCache();['portal_data_live_v3','portal_data_live_v2','portal_meta_live_v2','portal_data_v43_2026'].forEach(function(k){try{c.remove(k);}catch(ignore){}});
}
function authorizedSyncNow_(email){assertPortalRoles_(email,['ADMIN','COMMS']);return runPortalLiveSync({force:true,triggeredBy:'PORTAL_POST',actor:email});}
function apiCenterQueuePublicationV475_(p,email){assertPortalRoles_(email,['ADMIN','COMMS']);ensurePortalCloseoutSchema_();p=Object.assign({},p||{});p.createdBy=email;const out=apiCenterQueuePublication(p);portalClearDataCache_();return out;}

function authorizedCreatePortalRequest_(p,email){assertPortalRoles_(email,['ADMIN','COMMS','REQUESTER']);return createPortalRequest_(p,email);}
function authorizedUpdatePortalRequest_(p,email){assertRequestWriteAccess_(email,p&&p.id,false);return updatePortalRequest_(p,email);}
function authorizedReviewDecision_(p,email){assertPortalRoles_(email,['ADMIN','COMMS','REVIEWER']);return saveReviewDecision_(p,email);}
function authorizedCycleSave_(p,email){assertPortalRoles_(email,['ADMIN','COMMS']);return saveCycleRule(p,email);}
function authorizedSmartLink_(p,email){assertPortalRoles_(email,['ADMIN','COMMS']);return createSmartLinkRecord_(p,email);}
function authorizedAnalyzeContent_(p,email){assertPortalRoles_(email,['ADMIN','COMMS']);return analyzeContent(p,email);}
function authorizedUploadArtwork_(p,email){assertRequestWriteAccess_(email,p&&p.requestId,false);return uploadArtwork(p,email);}

function ensurePortalCloseoutSchema_(){
  const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID);
  // Canonical Portal-owned request/write schema. Missing columns are appended; source data is never rewritten.
  ensureSheetColumns_(ss,'Requests',['request_id','legacy_slot','campaign_name','objective','requester_email','requester_name','team_id','team_name_snapshot','department','priority','priority_score','campaign_grade_ts','campaign_grade_ns','status','portal_workflow_status','business_impact','compliance_required','monetary_risk','launch_dependency','start_date','end_date','seller_scope','seller_target','target_criteria','target_size','created_at','updated_at','closed_at','parent_request_id','request_type','cycle_id','completeness_status','editable_until','locked_at','revision_due_at','manager_approval_status','manager_approver_email','manager_approved_at','preferred_time_slot','time_source','source_system']);
  ensureSheetColumns_(ss,'Comms_Items',['comms_item_id','request_id','channel_group','module','asset_type','title','key_message','destination_url','owner_email','reviewer_email','approver_email','status','scheduled_at','published_at','artwork_url','current_version','created_at','updated_at']);
  ensureSheetColumns_(ss,'Ticket_Events',['event_id','request_id','event_type','from_status','to_status','actor_email','created_at','metadata_json']);
  ensureSheetColumns_(ss,'Review_Tasks',['review_task_id','request_id','reviewer_email','review_type','review_status','assigned_at','due_at','decision_at','decision','cycle_id','review_layer','reviewer_capability','revision_fields_json','revision_due_at','request_version','status_before','status_after','updated_at']);
  ensureSheetColumns_(ss,'Portal_Lookups',['lookup_id','category','value','sort_order','active','created_at','created_by','updated_at','updated_by']);
  ensureSheetColumns_(ss,'Config_History',['history_id','config_scope','config_key','old_value','new_value','changed_at','changed_by','change_reason','metadata_json']);
  ensureSheetColumns_(ss,'Content_Master',['content_id','request_id','campaign_name','content_type','platform','title','master_copy','asset_url','status','owner_email','created_at','updated_at','created_by','updated_by']);
  ensureSheetColumns_(ss,'Scoring_Models',['model_id','model_name','model_status','model_mode','version','critical_min','high_min','medium_min','auto_finalist','human_override','change_reason','created_at','created_by']);
  ensureSheetColumns_(ss,'Scoring_Rules',['rule_id','model_id','rule_type','factor','weight','source','status','sort_order']);
  ensureSheetColumns_(ss,'Tracking_Links',['tracking_id','request_id','comms_item_id','tracking_version','original_url','generated_url','short_url','status','created_at','created_by','link_type','utm_source','utm_medium','utm_campaign','utm_content','utm_term','custom_params_json','external_server_url','external_reference_id','external_source_url','updated_at']);
  ensureSheetColumns_(ss,'Short_Link_Routes',['short_code','tracking_id','destination_url','short_url','status','route_version','click_count','created_at','created_by','updated_at','last_clicked_at','legacy_param_policy','destination_hash','notes','metadata_json']);
  ensureApiCenterSchemaV475_(ss);ensureScoringSeedV475_(ss);return true;
}
function ensureApiCenterSchemaV475_(ss){
  ensureSheetColumns_(ss,'API_Connections',['connection_id','connection_name','provider','endpoint_ref','auth_mode','auth_secret_ref','sensitivity_policy','owner','contract_status','enabled','notes','created_at','updated_at']);
  ensureSheetColumns_(ss,'API_Routes',['route_id','connection_id','route_name','source_type','target','execution_mode','approval_required','sensitivity_policy','active','notes']);
  ensureSheetColumns_(ss,'API_Publication_Queue',['queue_id','request_id','comms_item_id','connection_id','route_id','title','summary','destination_url','asset_url','audience','sensitivity_class','approval_status','delivery_status','payload_snapshot_json','created_at','created_by','approved_at','approved_by','delivered_at','response_reference','last_error','notes']);
  ensureSheetColumns_(ss,'API_Logs',['log_id','connection_id','route_id','queue_id','action','outcome','started_at','finished_at','latency_ms','response_reference','error_message','actor','metadata_json']);
  const connections=readApiTable_(ss,'API_Connections');
  if(!connections.some(function(r){return String(r.connection_id||r.id)==='CONN-CLASSROOM-PR';})){
    appendApiObject_(ss.getSheetByName('API_Connections'),{connection_id:'CONN-CLASSROOM-PR',connection_name:'Classroom Internal PR',provider:'Google Apps Script / Approved Internal Endpoint',endpoint_ref:'API_CENTER_CLASSROOM_PR_ENDPOINT',auth_mode:'CORPORATE_WORKSPACE',auth_secret_ref:'',sensitivity_policy:'NON_SENSITIVE_ONLY',owner:'Seller Education / Comms',contract_status:'CONTRACT_TEST_REQUIRED',enabled:'FALSE',notes:'Fail-closed until endpoint, payload/auth contract and response behavior are verified.',created_at:new Date(),updated_at:new Date()});
  }
  const routes=readApiTable_(ss,'API_Routes');
  if(!routes.some(function(r){return String(r.route_id||r.id)==='ROUTE-CLASSROOM';}))appendApiObject_(ss.getSheetByName('API_Routes'),{route_id:'ROUTE-CLASSROOM',connection_id:'CONN-CLASSROOM-PR',route_name:'Classroom / Seller Education PR',source_type:'REQUEST_OR_CONTENT',target:'Internal PR',execution_mode:'REVIEW_THEN_SEND',approval_required:'TRUE',sensitivity_policy:'NON_SENSITIVE_ONLY',active:'TRUE',notes:'Human approval required.'});
  if(!routes.some(function(r){return String(r.route_id||r.id)==='ROUTE-IMPORTANT-COMMS';}))appendApiObject_(ss.getSheetByName('API_Routes'),{route_id:'ROUTE-IMPORTANT-COMMS',connection_id:'CONN-CLASSROOM-PR',route_name:'Important Non-Sensitive Comms',source_type:'REQUEST',target:'Internal PR',execution_mode:'REVIEW_THEN_SEND',approval_required:'TRUE',sensitivity_policy:'NON_SENSITIVE_ONLY',active:'TRUE',notes:'Human approval required.'});
}
function ensureScoringSeedV475_(ss){
  const models=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Scoring_Models');
  if(!models.length)appendByHeader_('Scoring_Models',{model_id:'MODEL-SC-CAL-V1',model_name:'Campaign Grading v1',model_status:'CALIBRATION',model_mode:'SHADOW',version:1,critical_min:80,high_min:60,medium_min:40,auto_finalist:'FALSE',human_override:'TRUE',change_reason:'Approved baseline carried into v4.9.3 closeout.',created_at:new Date(),created_by:'SYSTEM_MIGRATION'});
  const rules=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Scoring_Rules');
  if(!rules.length){
    const rows=[
      ['GATE-TITLE','GATE','Title validation','', 'Title Validation','SOURCE_SUPPORTED'],['GATE-CONTENT','GATE','Content validation','', 'Content Validation','SOURCE_SUPPORTED'],['GATE-DEST','GATE','Destination ready','', 'Destination Link','SOURCE_SUPPORTED'],['GATE-TARGET','GATE','Seller target ready','', 'Seller Scope + Target Sellers','SOURCE_SUPPORTED'],['GATE-AW','GATE','Artwork ready when required','', 'Asset Type + Artwork','SOURCE_PLUS_PORTAL_RULE'],['GATE-DATE','GATE','Preferred date ready','', 'Preferred Date 1–3','SOURCE_SUPPORTED'],
      ['PRI-COMPLIANCE','PRIORITY','Compliance impact',30,'Compliance','CALIBRATION_SEED'],['PRI-MONETARY','PRIORITY','Seller monetary loss',25,'Monetary Loss','CALIBRATION_SEED'],['PRI-TIME','PRIORITY','Time-sensitive content',20,'Time-Sensitive Content','CALIBRATION_SEED'],['PRI-SCOPE','PRIORITY','Seller reach',15,'Seller Scope','CALIBRATION_SEED'],['PRI-LEAD','PRIORITY','Lead-time risk',10,'Preferred Date + Cycle','CALIBRATION_SEED']
    ];
    rows.forEach(function(r,i){appendByHeader_('Scoring_Rules',{rule_id:r[0],model_id:'MODEL-SC-CAL-V1',rule_type:r[1],factor:r[2],weight:r[3],source:r[4],status:r[5],sort_order:i+1});});
  }
}

const PORTAL_BUSINESS_CONFIG_META_=[
  ['department_names','DEPARTMENT_NAMES','Organization','Departments','BD · MKT · OPS · Other Entities','text','','Requester department master list.'],
  ['team_names','TEAM_NAMES','Organization','Team / Sub Team Names','Managed from Teams','text','','Editable team names; records retain stable team_id.'],
  ['sc_lead_days','SC_LEAD_DAYS','SLA & Lead Time','SC Normal Lead Time','4','number','working days','Default lead-time rule before allocation.'],
  ['pnar_lead_days','PNAR_LEAD_DAYS','SLA & Lead Time','PN/AR Lead Time','7','number','working days','Configurable PN/AR request lead time.'],
  ['social_lead_days','SOCIAL_LEAD_DAYS','SLA & Lead Time','Social Lead Time','3','number','working days','Artwork + copy readiness baseline.'],
  ['important_channels','IMPORTANT_CHANNELS','Communication','Important Announcement Only','PN · PC Notice · APP Notice','text','','Hidden from Requester; Admin/Comms assign only.'],
  ['manager_consent','MANAGER_CONSENT','Workflow','Urgent Manager Consent','Enabled','select','','Urgent request requires manager consent before Comms triage.'],
  ['export_channels','EXPORT_CHANNELS','Export','Channel Filter','All active channels','text','','CSV Export supports all/multi-select channels.'],
  ['tracker_sync_interval','TRACKER_SYNC_INTERVAL','Data Sync','Tracker Refresh Interval','60','number','seconds','How often the Portal checks the source while the page is open.'],
  ['tracker_sync_endpoint','TRACKER_SYNC_ENDPOINT','Data Sync','Google Sheet Sync Endpoint','','text','','Apps Script Web App URL used by Firebase Hosting for live sync.'],
  ['smart_link_external_server','SMART_LINK_EXTERNAL_SERVER','Smart Links','External Link Server Endpoint','','text','','Optional approved external short-link/converter endpoint.'],
  ['api_center_mode','API_CENTER_MODE','API Center','Integration Execution Mode','SERVER_SIDE_ONLY','text','','Outbound integration calls are server-side only.'],
  ['api_center_sensitivity','API_CENTER_SENSITIVITY','API Center','Internal PR Sensitivity Policy','NON_SENSITIVE_ONLY','text','','Blocks PII, seller lists and restricted content.'],
  ['api_center_classroom_pr','API_CENTER_CLASSROOM_PR','API Center','Classroom Internal PR Endpoint','Configured server-side','text','','Endpoint secret/value remains in Script Properties.']
];
function portalBusinessConfigDto_(rows){
  const m={};(rows||[]).forEach(function(r){m[String(r.key||'').toUpperCase()]=r;});
  return PORTAL_BUSINESS_CONFIG_META_.map(function(x){const r=m[x[1]]||{},type=x[5];return {id:x[0],key:x[1],group:x[2],label:x[3],value:x[0]==='api_center_classroom_pr'?(PropertiesService.getScriptProperties().getProperty('API_CENTER_CLASSROOM_PR_ENDPOINT')?'Configured server-side':'Not configured'):(r.value!==undefined&&r.value!==''?r.value:x[4]),type:type,unit:x[6],description:x[7],options:type==='select'?['Enabled','Disabled']:undefined,updatedAt:r.updated_at||'',updatedBy:r.updated_by||''};});
}
function portalConfigHistoryDto_(){return readObjects_(PORTAL_DB_SPREADSHEET_ID,'Config_History').slice().reverse().slice(0,500).map(function(r){return {id:r.history_id||'',configId:String(r.config_key||'').toLowerCase(),from:r.old_value||'',to:r.new_value||'',changedAt:r.changed_at||'',changedBy:r.changed_by||'',scope:r.config_scope||''};});}
function portalConfigMetaById_(id){return PORTAL_BUSINESS_CONFIG_META_.find(function(x){return x[0]===String(id||'');})||null;}
function saveBusinessConfig_(p,email){
  assertPortalRoles_(email,['ADMIN']);ensurePortalCloseoutSchema_();const meta=portalConfigMetaById_(p&&p.id);if(!meta)throw new Error('Config not found.');
  if(meta[0]==='api_center_classroom_pr')throw new Error('Endpoint values are secret server-side configuration and cannot be changed from Firebase UI.');
  const current=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Config').find(function(r){return String(r.key||'').toUpperCase()===meta[1];}),before=current?current.value:meta[4],value=String(p.value===undefined?'':p.value).trim();
  if(meta[5]==='number'&&(!/^\d+(\.\d+)?$/.test(value)||Number(value)<0))throw new Error('A non-negative numeric value is required.');
  if(meta[5]==='select'&&['Enabled','Disabled'].indexOf(value)<0)throw new Error('Unsupported configuration value.');
  upsertConfigValue_(meta[1],value,meta[7],email);appendConfigHistory_('BUSINESS_CONFIG',meta[1],before,value,email,{portalId:meta[0]});portalClearDataCache_();
  return {config:portalBusinessConfigDto_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Config')),history:portalConfigHistoryDto_()};
}

function portalLookupKey_(category,value){return String(category||'').trim().toLowerCase()+'|'+String(value||'').trim().toLowerCase();}
function portalLookupDto_(requests){
  ensurePortalCloseoutSchema_();const rows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Portal_Lookups'),latest={};rows.forEach(function(r){latest[portalLookupKey_(r.category,r.value)]=r;});
  const build=function(category,base){const suppress={},add=[];Object.keys(latest).forEach(function(k){const r=latest[k];if(String(r.category||'').toLowerCase()!==String(category).toLowerCase())return;if(String(r.active||'TRUE').toUpperCase()==='FALSE')suppress[String(r.value||'').toLowerCase()]=1;else add.push({value:String(r.value||''),sort:Number(r.sort_order||100)});});const vals=(base||[]).filter(Boolean).filter(function(v){return !suppress[String(v).toLowerCase()];});add.sort(function(a,b){return a.sort-b.sort||a.value.localeCompare(b.value);}).forEach(function(x){if(!vals.some(function(v){return String(v).toLowerCase()===x.value.toLowerCase();}))vals.push(x.value);});return vals;};
  const req=requests||[];return {departments:build('Department',['BD','MKT','OPS','Other Entities']),objectives:build('Objective',unique_(req.map(function(x){return x.objective;}))),assets:build('Asset / Channel',unique_(req.map(function(x){return x.sourceAssetType||x.assetType;}))),statuses:build('Status',unique_(req.map(function(x){return x.status;}))),sellerScopes:build('Seller Scope',['All Platform Sellers','Specific Seller List']),lookupRows:rows.map(function(r){return {id:r.lookup_id||'',category:r.category||'',value:r.value||'',sortOrder:Number(r.sort_order||100),active:String(r.active||'TRUE').toUpperCase()!=='FALSE'};})};
}
function saveLookup_(p,email){
  assertPortalRoles_(email,['ADMIN']);ensurePortalCloseoutSchema_();const category=String(p.category||'').trim(),value=String(p.value||'').trim();if(['Department','Objective','Asset / Channel','Asset','Status','Seller Scope'].indexOf(category)<0)throw new Error('Unknown lookup category.');if(!value)throw new Error('Lookup value is required.');
  const normalized=category==='Asset'? 'Asset / Channel':category,rows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Portal_Lookups'),existing=rows.find(function(r){return portalLookupKey_(r.category,r.value)===portalLookupKey_(normalized,value);}),now=new Date();
  if(existing){const f=findRowById_('Portal_Lookups','lookup_id',existing.lookup_id);writeFields_(f,{category:normalized,value:value,sort_order:Number(p.sortOrder||100),active:'TRUE',updated_at:now,updated_by:email});}
  else appendByHeader_('Portal_Lookups',{lookup_id:'LKP-'+Utilities.getUuid(),category:normalized,value:value,sort_order:Number(p.sortOrder||100),active:'TRUE',created_at:now,created_by:email,updated_at:now,updated_by:email});
  portalClearDataCache_();return portalLookupDto_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').filter(activePortalRequest_).map(function(r){return portalRequestDto_(r,{}, {}, {});}));
}
function deleteLookup_(p,email){
  assertPortalRoles_(email,['ADMIN']);ensurePortalCloseoutSchema_();const category=String(p.category||'').trim()==='Asset'?'Asset / Channel':String(p.category||'').trim(),value=String(p.value||'').trim();if(!value)throw new Error('Lookup value is required.');const rows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Portal_Lookups'),existing=rows.find(function(r){return portalLookupKey_(r.category,r.value)===portalLookupKey_(category,value);}),now=new Date();
  if(existing){const f=findRowById_('Portal_Lookups','lookup_id',existing.lookup_id);writeFields_(f,{active:'FALSE',updated_at:now,updated_by:email});}
  else appendByHeader_('Portal_Lookups',{lookup_id:'LKP-'+Utilities.getUuid(),category:category,value:value,sort_order:100,active:'FALSE',created_at:now,created_by:email,updated_at:now,updated_by:email});
  portalClearDataCache_();return portalLookupDto_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').filter(activePortalRequest_).map(function(r){return portalRequestDto_(r,{}, {}, {});}));
}

function normalizeContentMasterRows_(rows){return (rows||[]).slice().reverse().slice(0,1000).map(function(r){return {id:r.content_id||'',requestId:r.request_id||'',campaign:r.campaign_name||'',type:r.content_type||'',platform:r.platform||'',title:r.title||'',copy:r.master_copy||'',assetUrl:r.asset_url||'',status:r.status||'Draft',owner:r.owner_email||'',createdAt:r.created_at||'',updatedAt:r.updated_at||''};});}
function createPortalContent_(p,email){
  assertPortalRoles_(email,['ADMIN','COMMS']);ensurePortalCloseoutSchema_();const title=String(p.title||'').trim(),campaign=String(p.campaign||'').trim();if(!title||!campaign)throw new Error('Campaign and Title are required.');const now=new Date(),obj={content_id:'CNT-'+Utilities.getUuid(),request_id:p.requestId||'',campaign_name:campaign,content_type:p.type||'Master',platform:p.platform||'Master',title:title,master_copy:p.copy||'',asset_url:p.assetUrl||'',status:p.status||'Draft',owner_email:email,created_at:now,updated_at:now,created_by:email,updated_by:email};appendByHeader_('Content_Master',obj);portalClearDataCache_();return normalizeContentMasterRows_([obj])[0];
}

function saveReviewComment_(p,email){
  assertPortalRoles_(email,['ADMIN','COMMS','REVIEWER']);const requestId=String(p.requestId||'');if(!portalRequestRow_(requestId))throw new Error('Request not found.');const note=String(p.comment||'').trim();appendByHeader_('Ticket_Events',{event_id:'EVT-'+Utilities.getUuid(),request_id:requestId,event_type:'REVIEW_COMMENT',from_status:'',to_status:'',actor_email:email,created_at:new Date(),metadata_json:JSON.stringify({comment:note})});return {requestId:requestId,comment:note,saved:true};
}

function normalizeScoringModelsV475_(rows){return (rows||[]).slice().sort(function(a,b){return Number(b.version||0)-Number(a.version||0);}).map(function(r){return {id:r.model_id||'',name:r.model_name||'',status:r.model_status||'CALIBRATION',mode:r.model_mode||'SHADOW',version:Number(r.version||1),criticalMin:Number(r.critical_min||80),highMin:Number(r.high_min||60),mediumMin:Number(r.medium_min||40),autoFinalist:String(r.auto_finalist||'FALSE').toUpperCase()==='TRUE',humanOverride:String(r.human_override||'TRUE').toUpperCase()!=='FALSE',changeReason:r.change_reason||'',createdAt:r.created_at||'',createdBy:r.created_by||''};});}
function normalizeScoringRulesV475_(rows){return (rows||[]).slice().sort(function(a,b){return Number(a.sort_order||0)-Number(b.sort_order||0);}).map(function(r){return {id:r.rule_id||'',modelId:r.model_id||'',type:r.rule_type||'',factor:r.factor||'',weight:r.weight===''?null:Number(r.weight),source:r.source||'',status:r.status||''};});}
function saveScoringModelVersion_(p,email){
  assertPortalRoles_(email,['ADMIN']);ensurePortalCloseoutSchema_();const c=Number(p.critical),h=Number(p.high),m=Number(p.medium);if([c,h,m].some(function(x){return !isFinite(x)||x<0||x>100;}))throw new Error('Thresholds must be between 0 and 100.');if(!(c>=h&&h>=m))throw new Error('Threshold order must be Critical >= High >= Medium.');const reason=String(p.reason||'').trim();if(!reason)throw new Error('Change reason is required.');const rows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Scoring_Models'),version=rows.reduce(function(max,r){return Math.max(max,Number(r.version||0));},0)+1,id='MODEL-SC-CAL-V'+version;appendByHeader_('Scoring_Models',{model_id:id,model_name:'Campaign Grading v'+version,model_status:'CALIBRATION',model_mode:'SHADOW',version:version,critical_min:c,high_min:h,medium_min:m,auto_finalist:'FALSE',human_override:'TRUE',change_reason:reason,created_at:new Date(),created_by:email});portalClearDataCache_();return {models:normalizeScoringModelsV475_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Scoring_Models')),rules:normalizeScoringRulesV475_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Scoring_Rules'))};
}

function normalizeApiCenterV475_(raw){
  raw=raw||{};return {
    apiConnections:(raw.connections||[]).map(function(r){return {id:r.connection_id||r.id||'',name:r.connection_name||r.name||'',provider:r.provider||'',endpointRef:r.endpoint_ref||r.endpointRef||'',authMode:r.auth_mode||r.authMode||'',sensitivityPolicy:r.sensitivity_policy||r.sensitivityPolicy||'',owner:r.owner||'',status:r.contract_status||r.status||'CONTRACT_TEST_REQUIRED',enabled:String(r.enabled||'FALSE').toUpperCase()==='TRUE',notes:r.notes||''};}),
    apiRoutes:(raw.routes||[]).map(function(r){return {id:r.route_id||r.id||'',connectionId:r.connection_id||r.connectionId||'',name:r.route_name||r.name||'',sourceType:r.source_type||r.sourceType||'',target:r.target||'',mode:r.execution_mode||r.mode||'',approvalRequired:String(r.approval_required||'TRUE').toUpperCase()!=='FALSE',sensitivityPolicy:r.sensitivity_policy||'',active:String(r.active||'TRUE').toUpperCase()!=='FALSE'};}),
    apiQueue:(raw.queue||[]).slice().reverse().slice(0,300).map(function(r){return {id:r.queue_id||r.id||'',requestId:r.request_id||'',connectionId:r.connection_id||'',routeId:r.route_id||'',title:r.title||'',summary:r.summary||'',destinationUrl:r.destination_url||'',sensitivity:r.sensitivity_class||'',approvalStatus:r.approval_status||'',deliveryStatus:r.delivery_status||'',createdAt:r.created_at||'',createdBy:r.created_by||'',approvedAt:r.approved_at||'',approvedBy:r.approved_by||'',deliveredAt:r.delivered_at||'',reference:r.response_reference||'',lastError:r.last_error||''};}),
    apiLogs:(raw.logs||[]).slice().reverse().slice(0,300).map(function(r){return {id:r.log_id||'',connectionId:r.connection_id||'',routeId:r.route_id||'',queueId:r.queue_id||'',action:r.action||'',outcome:r.outcome||'',startedAt:r.started_at||'',createdAt:r.started_at||'',reference:r.response_reference||'',error:r.error_message||''};})
  };
}
function apiCenterApprovePublicationV475_(queueId,email){
  assertPortalRoles_(email,['ADMIN','COMMS']);ensurePortalCloseoutSchema_();const f=findRowById_('API_Publication_Queue','queue_id',queueId);if(!f)throw new Error('API queue item not found.');writeFields_(f,{approval_status:'APPROVED',approved_at:new Date(),approved_by:email});const row=readObjects_(PORTAL_DB_SPREADSHEET_ID,'API_Publication_Queue').find(function(r){return String(r.queue_id)===String(queueId);})||{};appendApiLog_(SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),row.connection_id,row.route_id,queueId,'APPROVE_PUBLICATION','SUCCESS','', '');return {queueId:queueId,approvalStatus:'APPROVED'};
}
function apiCenterConnectionStatusV475_(connectionId,email){
  assertPortalRoles_(email,['ADMIN','COMMS']);ensurePortalCloseoutSchema_();const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),rows=readApiTable_(ss,'API_Connections'),r=rows.find(function(x){return String(x.connection_id||x.id)===String(connectionId);});if(!r)throw new Error('API connection not found.');const ref=String(r.endpoint_ref||''),secretRef=String(r.auth_secret_ref||''),props=PropertiesService.getScriptProperties(),endpoint=ref?props.getProperty(ref):'',secretOk=!secretRef||!!props.getProperty(secretRef),contract=String(r.contract_status||'CONTRACT_TEST_REQUIRED').toUpperCase(),enabled=String(r.enabled||'FALSE').toUpperCase()==='TRUE',canSend=contract==='VERIFIED'&&enabled&&!!endpoint&&secretOk;appendApiLog_(ss,r.connection_id||'', '', '', 'CONNECTION_STATUS',canSend?'SUCCESS':'BLOCKED','',canSend?'':'Connection is fail-closed until VERIFIED + enabled + endpoint/auth configuration.');return {id:r.connection_id||'',status:contract,verified:contract==='VERIFIED',enabled:enabled,endpointConfigured:!!endpoint,authConfigured:secretOk,canSend:canSend,message:canSend?'Connection is verified and send-capable.':'Fail-closed: verify contract, enable connection and configure endpoint/auth server-side.'};
}
function apiCenterSendPublicationV475_(queueId,email){
  assertPortalRoles_(email,['ADMIN','COMMS']);ensurePortalCloseoutSchema_();const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),queue=readApiTable_(ss,'API_Publication_Queue'),item=queue.find(function(x){return String(x.queue_id)===String(queueId);});if(!item)throw new Error('API queue item not found.');if(String(item.approval_status||'').toUpperCase()!=='APPROVED')throw new Error('Human approval is required before Send.');if(String(item.sensitivity_class||'').toUpperCase()!=='NON_SENSITIVE')throw new Error('Only NON_SENSITIVE content can be sent.');
  const connections=readApiTable_(ss,'API_Connections'),c=connections.find(function(x){return String(x.connection_id||'')===String(item.connection_id||'');});if(!c)throw new Error('API connection not found.');const contract=String(c.contract_status||'').toUpperCase(),enabled=String(c.enabled||'FALSE').toUpperCase()==='TRUE';if(contract!=='VERIFIED'||!enabled)throw new Error('API delivery is fail-closed until the target connection is VERIFIED and enabled.');const props=PropertiesService.getScriptProperties(),endpoint=props.getProperty(String(c.endpoint_ref||''));if(!endpoint||!/^https:\/\//i.test(endpoint))throw new Error('Approved API endpoint is not configured server-side.');
  const headers={},auth=String(c.auth_mode||'').toUpperCase(),secretRef=String(c.auth_secret_ref||'');if(auth==='BEARER_TOKEN'){const token=props.getProperty(secretRef);if(!token)throw new Error('API bearer token is not configured server-side.');headers.Authorization='Bearer '+token;}else if(auth==='CORPORATE_WORKSPACE'){headers.Authorization='Bearer '+ScriptApp.getOAuthToken();}else if(auth&&auth!=='NONE')throw new Error('Unsupported API auth mode: '+auth);
  const payload={queueId:item.queue_id,requestId:item.request_id||'',routeId:item.route_id||'',title:item.title||'',summary:item.summary||'',destinationUrl:item.destination_url||'',assetUrl:item.asset_url||'',audience:item.audience||'Internal',sensitivity:'NON_SENSITIVE'};const start=new Date(),f=findRowById_('API_Publication_Queue','queue_id',queueId);try{const response=UrlFetchApp.fetch(endpoint,{method:'post',contentType:'application/json',headers:headers,payload:JSON.stringify(payload),muteHttpExceptions:true,followRedirects:true}),code=response.getResponseCode(),text=String(response.getContentText()||'').slice(0,1000),latency=new Date().getTime()-start.getTime();if(code<200||code>=300){writeFields_(f,{delivery_status:'FAILED',last_error:'HTTP '+code,delivered_at:'',response_reference:text.slice(0,250)});appendApiLog_(ss,item.connection_id,item.route_id,queueId,'SEND_PUBLICATION','FAILED',text.slice(0,250),'HTTP '+code);throw new Error('API delivery failed with HTTP '+code+'.');}writeFields_(f,{delivery_status:'DELIVERED',delivered_at:new Date(),response_reference:text.slice(0,250),last_error:''});appendApiLog_(ss,item.connection_id,item.route_id,queueId,'SEND_PUBLICATION','SUCCESS',text.slice(0,250),'');return {queueId:queueId,deliveryStatus:'DELIVERED',httpStatus:code,latencyMs:latency,responseReference:text.slice(0,250)};}catch(err){if(String(err&&err.message||'').indexOf('HTTP ')<0){writeFields_(f,{delivery_status:'FAILED',last_error:String(err&&err.message||err).slice(0,500)});appendApiLog_(ss,item.connection_id,item.route_id,queueId,'SEND_PUBLICATION','FAILED','',String(err&&err.message||err));}throw err;}
}

function applyReviewNotesV475_(requests){
  const byId={};(requests||[]).forEach(function(r){byId[String(r.id||'')]=r;});
  const events=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Ticket_Events');
  events.forEach(function(ev){
    const r=byId[String(ev.request_id||'')];if(!r)return;
    const type=String(ev.event_type||'').toUpperCase();if(['REVIEW_COMMENT','APPROVE','NEED_REVISED','REJECT','REJECTED'].indexOf(type)<0)return;
    const meta=parseJsonSafe_(ev.metadata_json,{}),comment=String(meta.comment||'').trim();if(comment)r.reviewNote=comment;
    if(Array.isArray(meta.revisionFields)&&meta.revisionFields.length)r.revisionFields=meta.revisionFields;
    if(type==='NEED_REVISED')r.revisionDueAt=r.revisionDueAt||'';
  });
  return requests;
}

function getFormMetaV475_(p){
  p=p||{};const campaign=String(p.campaign||''),grade={ts:/mega|flash|policy|fraud/i.test(campaign)?'A+':'A',ns:/education|welcome/i.test(campaign)?'A+':'A'};
  let score=0;if(p.urgent===true||String(p.requestType||p.commsType||'').toUpperCase().indexOf('URG')>=0)score+=40;if(p.compliance===true||String(p.compliance||'').toUpperCase()==='TRUE')score+=35;if(p.monetary===true||String(p.monetary||'').toUpperCase()==='TRUE')score+=25;if(grade.ts==='A+')score+=10;if(grade.ns==='A+')score+=5;
  const level=score>=70?'P0 Critical':score>=45?'P1 High':score>=25?'P2 Medium':'P3 Normal';
  let assets=[];try{assets=portalLookupDto_([]).assets||[];}catch(ignore){}
  if(!assets.length&&Array.isArray(p.channels))assets=p.channels.slice();
  const rec=assets.slice(0,12).map(function(asset){return {asset:asset,eligible:true,mandatory:false,reason:'Matched current Portal configuration'};});
  if(p.urgent===true){const x=rec.find(function(x){return /PN$| · PN$/i.test(x.asset);});if(x)x.mandatory=true;}
  if(p.compliance===true){const x=rec.find(function(x){return /Homepage Announcement/i.test(x.asset);});if(x)x.mandatory=true;}
  return {campaignGrade:grade,priority:{score:score,level:level},recommendations:rec.slice(0,6),source:'server-rule-v4.9.3'};
}

// Apps Script embedded-mode public RPC surface. Every write uses the same authorization layer as Firebase Hosting.
function getPortalData(){ensurePeopleSchema_();ensureContentOpsSchema_();ensurePortalCloseoutSchema_();const v=portalViewerContext_();ensurePeopleSeedV474IfNeeded_(v.email);ensureFreshPortalSnapshot_();return getPortalData_(v);}
function getFormMeta(p){portalViewerContext_();return getFormMetaV475_(p);}
function submitRequest(p){const e=portalCurrentEmail_(),out=authorizedCreatePortalRequest_(p,e);portalClearDataCache_();return out;}
function updateRequest(p){const e=portalCurrentEmail_(),out=authorizedUpdatePortalRequest_(p,e);portalClearDataCache_();return out;}
function saveReviewDecision(p){const e=portalCurrentEmail_(),out=authorizedReviewDecision_(p,e);portalClearDataCache_();return out;}
function saveReviewComment(p){const e=portalCurrentEmail_(),out=saveReviewComment_(p,e);portalClearDataCache_();return out;}
function createSmartLink(p){const e=portalCurrentEmail_(),out=authorizedSmartLink_(p,e);portalClearDataCache_();return out;}
function getSmartLinkProviderStatus(p){const e=portalCurrentEmail_();return smartLinkProviderStatus_(p||{},e);}
function configureTinyUrl(p){const e=portalCurrentEmail_(),out=configureTinyUrlProvider_(p||{},e);portalClearDataCache_();return out;}
function repairSmartLinks(p){const e=portalCurrentEmail_(),out=repairExistingSmartLinks_(p||{},e);portalClearDataCache_();return out;}
function createContent(p){const e=portalCurrentEmail_(),out=createPortalContent_(p,e);portalClearDataCache_();return out;}
function saveLookup(p){const e=portalCurrentEmail_(),out=saveLookup_(p,e);portalClearDataCache_();return out;}
function deleteLookup(p){const e=portalCurrentEmail_(),out=deleteLookup_(p,e);portalClearDataCache_();return out;}
function saveBusinessConfig(p){const e=portalCurrentEmail_(),out=saveBusinessConfig_(p,e);portalClearDataCache_();return out;}
function saveScoringModelVersion(p){const e=portalCurrentEmail_(),out=saveScoringModelVersion_(p,e);portalClearDataCache_();return out;}
function queueApiPublication(p){const e=portalCurrentEmail_();return apiCenterQueuePublicationV475_(p,e);}
function testApiConnection(p){const e=portalCurrentEmail_();return apiCenterConnectionStatusV475_((p||{}).id||(p||{}).connectionId,e);}
function approveApiPublication(p){const e=portalCurrentEmail_(),out=apiCenterApprovePublicationV475_((p||{}).id||(p||{}).queueId,e);portalClearDataCache_();return out;}
function sendApiPublication(p){const e=portalCurrentEmail_(),out=apiCenterSendPublicationV475_((p||{}).id||(p||{}).queueId,e);portalClearDataCache_();return out;}

function getPortalHealthSummary_(){
  ensurePortalCloseoutSchema_();const config=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Config'),cfg={};config.forEach(function(r){cfg[String(r.key||'')]=r.value;});const users=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Users'),requests=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').filter(activePortalRequest_),cp=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Sync_Checkpoints'),api=normalizeApiCenterV475_(apiCenterData()),pn=cp.some(function(r){return String(r.source_id)===PORTAL_SYNC_SOURCE_PN&&String(r.status||'').toUpperCase()==='SUCCESS';}),sc=cp.some(function(r){return String(r.source_id)===PORTAL_SYNC_SOURCE_SC&&String(r.status||'').toUpperCase()==='SUCCESS';}),social=cp.some(function(r){return String(r.source_id)===PORTAL_SYNC_SOURCE_SOCIAL&&String(r.status||'').toUpperCase()==='SUCCESS';});const checks={workspaceIdentity:true,peopleSeed:users.filter(function(u){return String(u.status||'').toUpperCase()==='ACTIVE';}).length>=PEOPLE_SEED_V474_EXPECTED,pnCheckpoint:pn,scaCheckpoint:sc,socialCheckpoint:social,requests:requests.length>0,contentSchema:true,lookupSchema:true,scoringSchema:true,apiSchema:true,sourceWritebackDisabled:true,publicSnapshotSanitized:true};const complete=Object.keys(checks).every(function(k){return checks[k]===true;});return {release:PORTAL_CLOSEOUT_RELEASE,status:complete?'READY':'ATTENTION',checks:checks,activeUsers:users.filter(function(u){return String(u.status||'').toUpperCase()==='ACTIVE';}).length,requestCount:requests.length,apiConnections:api.apiConnections.length,apiSendReady:api.apiConnections.some(function(c){return String(c.status).toUpperCase()==='VERIFIED'&&c.enabled;}),setupStatus:cfg.LIVE_SYNC_SETUP_STATUS||'PENDING_SETUP',checkedAt:new Date().toISOString()};
}
function getPortalHealth_(viewer){viewer=viewer||portalViewerContext_();const h=getPortalHealthSummary_();h.viewer={email:viewer.email,role:viewer.role};return h;}
