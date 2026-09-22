const PORTAL_PN_SPREADSHEET_ID = '1jCcfx0NExSfAzyj9a_lFYlIu3Re6qor9TIzaDATX7go';
const PORTAL_SC_SPREADSHEET_ID = '1f7ZFeR4a3fnQUBm3kOeoW7wLXRFKjvsIMpCOCu6teMI';
const PORTAL_SOCIAL_SPREADSHEET_ID = '1x6Cbg2B0t9Ji79-hL5W16-UV_L7MCZTeg3YgtOnwikM';
const PORTAL_DB_SPREADSHEET_ID = '1eWFb1PGngH1dzT993G0yfvNG-BvNVJQ66NtjdzIMyAU';
const PORTAL_FILTER_YEAR = 2026;
const PORTAL_BACKEND_RELEASE = '4.9.3';
const PORTAL_CACHE_SECONDS = 60;

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || 'portalData');
  const callback = sanitizeCallback_((e && e.parameter && e.parameter.callback) || 'portalSyncCallback');
  try {
    if (['portalData','portalMeta','health','syncNow'].indexOf(action) >= 0) {
      portalAuthorizeHttpSession_(String((e&&e.parameter&&e.parameter.session)||''));
    }
    if (action === 'setup') {
      const requestedRelease=String((e&&e.parameter&&e.parameter.release)||'').trim();
      if(requestedRelease&&requestedRelease!==PORTAL_BACKEND_RELEASE) throw new Error('BACKEND RELEASE MISMATCH: requested '+requestedRelease+' but this deployment serves '+PORTAL_BACKEND_RELEASE+'.');
      const consentPage = portalSetupConsentGate_();
      if(consentPage)return consentPage;
      const result = setupPortalLiveSync();
      return setupHtml_(true, result, '');
    }
    if (action === 'peopleImport') {
      return renderPeopleImportPage_();
    }
    if (action === 'syncNow') {
      const email = portalCurrentEmail_();
      assertPortalRoles_(email,['ADMIN','COMMS']);
      const sync = runPortalLiveSync({force:true, triggeredBy:'PORTAL_SYNC_NOW', actor:email});
      const payload = {ok:true,data:getPortalData_(),sync:sync};
      return jsonpOutput_(callback,payload);
    }
    if (['portalData','portalMeta','health'].indexOf(action) < 0) { portalViewerContext_(); if(typeof legacyPortalHttpGet_==='function')return legacyPortalHttpGet_(e); throw new Error('Unknown action.'); }
    ensurePeopleSchema_();
    ensureContentOpsSchema_();
    ensurePortalCloseoutSchema_();
    const viewer=portalViewerContext_();
    ensurePeopleSeedV474IfNeeded_(viewer.email);
    ensureFreshPortalSnapshot_();
    const data = action === 'portalData' ? getPortalData_(viewer) : (action === 'health' ? getPortalHealth_(viewer) : getPortalMeta_());
    return jsonpOutput_(callback,{ok:true,data:data});
  } catch (err) {
    if (action === 'setup') return setupHtml_(false,null,String(err && err.message ? err.message : err));
    return jsonpOutput_(callback,{ok:false,error:String(err && err.message ? err.message : err)});
  }
}

function jsonpOutput_(callback,payload){
  return ContentService.createTextOutput(callback+'('+JSON.stringify(payload)+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function setupHtml_(ok,result,error){
  const title=ok?'LIVE SYNC READY':'LIVE SYNC SETUP FAILED';
  const tone=ok?'#0f8a66':'#c7352b';
  let signedIn='';try{signedIn=String(Session.getActiveUser().getEmail()||'').trim().toLowerCase();}catch(ignore){}
  const identityLine=signedIn?'<p>Signed in as <strong>'+escapeHtml_(signedIn)+'</strong>.</p>':'<p>Workspace identity could not be resolved for this request.</p>';
  const releaseLine='<p>Backend release: <strong>v'+escapeHtml_(PORTAL_BACKEND_RELEASE)+'</strong>.</p>';
  const details=ok
    ? releaseLine+identityLine+'<p><strong>PN + SCA + Social Media Live Sync is active.</strong></p><p>People & Roles: <strong>'+Number((result.verification&&result.verification.activeUsers)||0)+' active users verified</strong> · '+Number((result.peopleSeed&&result.peopleSeed.inserted)||0)+' inserted · '+Number((result.peopleSeed&&result.peopleSeed.updated)||0)+' updated.</p><p>Portal requests reconciled: <strong>'+Number((result.verification&&result.verification.requests)||0)+'</strong> · PN checkpoint: '+((result.verification&&result.verification.pnCheckpoint)?'OK':'MISSING')+' · SCA checkpoint: '+((result.verification&&result.verification.scCheckpoint)?'OK':'MISSING')+' · Social checkpoint: '+((result.verification&&result.verification.socialCheckpoint)?'OK':'MISSING')+'.</p><p>Quality Gate V3 is filtering NA / empty / unusable rows. Source trackers remain read-only.</p><p>Automatic sync: every '+Number(result.triggerMinutes||5)+' minutes. Portal source checks: every 60 seconds.</p><p><a href="https://seller-communication-portal.web.app/?mode=ADMIN#settings" target="_top">Open Portal Settings</a></p>'
    : releaseLine+identityLine+'<p>'+escapeHtml_(error||'Unknown setup error')+'</p><p>Nothing was written back to the PN, SCA or Social Media source trackers.</p>';
  return HtmlService.createHtmlOutput('<!doctype html><html><head><base target="_top"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:Arial,sans-serif;background:#f6f7f9;color:#17233B;margin:0;padding:32px}.card{max-width:760px;margin:40px auto;background:#fff;border:1px solid #E3E7ED;border-radius:18px;padding:30px;box-shadow:0 16px 50px rgba(23,35,59,.10)}.brand{font-size:12px;font-weight:800;letter-spacing:.16em;color:#EE4D2D}.status{display:inline-block;margin:14px 0;padding:8px 12px;border-radius:999px;background:'+tone+';color:#fff;font-weight:800}h1{margin:4px 0 8px;font-size:30px}p{line-height:1.6;color:#556177}a{display:inline-block;background:#EE4D2D;color:#fff;text-decoration:none;font-weight:800;padding:12px 18px;border-radius:10px;margin-top:8px}</style></head><body><main class="card"><div class="brand">SELLER COMMUNICATION PORTAL</div><div class="status">'+title+'</div><h1>'+title+'</h1>'+details+'</main></body></html>').setTitle(title);
}

function getPortalMeta_(){
  const pn=DriveApp.getFileById(PORTAL_PN_SPREADSHEET_ID),sc=DriveApp.getFileById(PORTAL_SC_SPREADSHEET_ID),social=DriveApp.getFileById(PORTAL_SOCIAL_SPREADSHEET_ID);
  const latest=new Date(Math.max(pn.getLastUpdated().getTime(),sc.getLastUpdated().getTime(),social.getLastUpdated().getTime()));
  const requests=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').filter(activePortalRequest_);
  const states=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Sync_Record_State').filter(function(s){return String(s.missing_from_source||'').toUpperCase()!=='TRUE'&&['SOURCE_EXCLUDED','SOURCE_MISSING'].indexOf(String(s.canonical_status||'').toUpperCase())<0;});
  const exclusions=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Sync_Exclusions').filter(function(x){return String(x.active||'TRUE').toUpperCase()!=='FALSE';});
  const checkpoints=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Sync_Checkpoints');
  const config=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Config'),cfg={};config.forEach(function(r){cfg[String(r.key||'')]=r.value;});
  let lastSync='';checkpoints.forEach(function(c){const d=asDate_(c.last_successful_sync_at);if(d&&(!lastSync||d.getTime()>asDate_(lastSync).getTime()))lastSync=c.last_successful_sync_at;});
  const pnCount=states.filter(function(s){return String(s.source_id)===PORTAL_SYNC_SOURCE_PN;}).length;
  const scCount=states.filter(function(s){return String(s.source_id)===PORTAL_SYNC_SOURCE_SC;}).length;
  const socialCount=states.filter(function(s){return String(s.source_id)===PORTAL_SYNC_SOURCE_SOCIAL;}).length;
  return {
    mode:'live',source:'PN + SCA + Social Media Google Sheets',sheet:'PN Request + SCA SUBMISSION/FINALIST/Approval + Social Channel Schedule 2026',sourceUpdatedAt:latest.toISOString(),lastSuccessfulSyncAt:dateTimeIso_(lastSync),
    snapshotGeneratedAt:new Date().toISOString(),requestCount:requests.length,pnCount:pnCount,scCount:scCount,socialCount:socialCount,excludedCount:exclusions.length,
    qualityGate:'V3',engineVersion:cfg.LIVE_SYNC_SETUP_VERSION||PORTAL_LIVE_SYNC_VERSION,backendRelease:PORTAL_BACKEND_RELEASE,setupStatus:cfg.LIVE_SYNC_SETUP_STATUS||'PENDING_SETUP',
    sources:[
      {name:'[2026] Seller Comm Request Tracker',fileId:PORTAL_PN_SPREADSHEET_ID,sheet:'Requestor to fill in',updatedAt:pn.getLastUpdated().toISOString()},
      {name:'[TH] Seller Centre Asset SCA Request & Allocation',fileId:PORTAL_SC_SPREADSHEET_ID,sheet:'SUBMISSION FORM + FINALIST + PopUp Request Approval',updatedAt:sc.getLastUpdated().toISOString()},
      {name:'1. New Channel Landscape dashboard 2026 - Seller Education',fileId:PORTAL_SOCIAL_SPREADSHEET_ID,sheet:'Channel Schedule 2026',updatedAt:social.getLastUpdated().toISOString()}
    ],filterYear:PORTAL_FILTER_YEAR
  };
}

function getPortalData_(viewer){
  ensurePeopleSchema_();ensureContentOpsSchema_();ensurePortalCloseoutSchema_();viewer=viewer||portalViewerContext_();
  const cache=CacheService.getScriptCache(),key='portal_data_live_v3';let data=null,cached=cache.get(key);if(cached)data=JSON.parse(cached);
  if(!data){
    const requestRows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').filter(activePortalRequest_);
    const itemRows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Comms_Items');
    const stateRows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Sync_Record_State');
    const teamRows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Teams');
    const teamById={};teamRows.forEach(function(t){teamById[String(t.team_id||'')]={department:String(t.department||''),team:String(t.team_name||''),managerEmail:String(t.manager_email||'')};});
    const itemByRequest={},itemsByRequest={};itemRows.forEach(function(i){const k=String(i.request_id||'');if(!itemByRequest[k])itemByRequest[k]=i;if(!itemsByRequest[k])itemsByRequest[k]=[];itemsByRequest[k].push(i);});
    const stateByRequest={};stateRows.forEach(function(st){if(st.portal_request_id)stateByRequest[String(st.portal_request_id)]=st;});
    const requests=applyReviewNotesV475_(requestRows.map(function(r){const k=String(r.request_id||'');return portalRequestDto_(r,itemByRequest[k]||{},stateByRequest[k]||{},teamById[String(r.team_id||'')]||{},itemsByRequest[k]||[]);}));
    const configRows=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Config'),api=normalizeApiCenterV475_(apiCenterData());
    data={
      meta:getPortalMeta_(),requests:requests,campaigns:buildCampaign360_(requests),teams:buildTeamLookup_(requests),teamMembers:normalizeUsers_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Users'),teamRows),
      userImportJobs:normalizeUserImportJobs_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'User_Import_Jobs')),links:normalizeTrackingLinks_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Tracking_Links')),content:normalizeContentMasterRows_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Content_Master')),contentInsights:normalizeContentInsights_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Content_AI_Insights')),channelRules:normalizeChannelRules_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Channel_Rules')),
      businessConfig:portalBusinessConfigDto_(configRows),configHistory:portalConfigHistoryDto_(),shortLinkPolicy:shortLinkPolicyFromConfig_(configRows),cycles:normalizeCycles_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Communication_Cycles')),
      cycleRules:normalizeCycleRules_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Cycle_Rules')),notificationRules:normalizeNotificationRules_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Notification_Rules')),lookups:portalLookupDto_(requests),
      scoringModels:normalizeScoringModelsV475_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Scoring_Models')),scoringRules:normalizeScoringRulesV475_(readObjects_(PORTAL_DB_SPREADSHEET_ID,'Scoring_Rules')),
      apiConnections:api.apiConnections,apiRoutes:api.apiRoutes,apiQueue:api.apiQueue,apiLogs:api.apiLogs,systemHealth:getPortalHealthSummary_()
    };
    const encoded=JSON.stringify(data);if(encoded.length<95000)cache.put(key,encoded,PORTAL_CACHE_SECONDS);
  }
  data.user=viewer.user;data.permissions=viewer.permissions;return data;
}

function activePortalRequest_(r){
  const status=String(r.status||'').toUpperCase();
  return ['SOURCE_EXCLUDED','SOURCE_MISSING'].indexOf(status)<0;
}

function portalRequestDto_(r,item,state,team,items){
  items=Array.isArray(items)&&items.length?items:(item&&Object.keys(item).length?[item]:[]);const raw=parseJsonSafe_(state.source_status_json,{}),sourceId=String(state.source_id||''),sourceSystem=String(r.source_system||'').toUpperCase(),isNative=sourceSystem==='PORTAL_NATIVE',isSc=sourceId===PORTAL_SYNC_SOURCE_SC||sourceSystem==='GOOGLE_SHEETS_SC',isSocial=sourceId===PORTAL_SYNC_SOURCE_SOCIAL||sourceSystem==='GOOGLE_SHEETS_SOCIAL';
  const finalist=raw.finalist||null,sourceAsset=String(item.asset_type||raw.assetType||'').trim();
  const sourceStatus=isSc?(finalist?String(finalist.status||raw.allocationStatus||'Requested'):String(raw.allocationStatus||'Requested')):(isSocial?String(raw.originalStatus||raw.status||state.canonical_substatus||r.status||''):String(raw.formulaStatus||raw.sourceDecision||state.canonical_substatus||r.status||''));
  const nativeAssets=items.map(function(x){return String(x.asset_type||'').trim();}).filter(Boolean);
  const assetType=isNative?(nativeAssets.join(', ')||sourceAsset||'Portal Request'):(isSc?'Internal · SCA · '+(sourceAsset||'SCA'):(isSocial?'External · Social Media · '+(sourceAsset||'Social Media'):('Internal · PN / EDM · '+(sourceAsset||'PN / EDM'))));
  const sourceName=isNative?'Portal Native':(isSc?'SCA':(isSocial?'Social Media':'PN'));
  const dto={
    id:r.request_id||'',legacySlot:r.legacy_slot||'',sourceRequestId:state.source_request_id||r.legacy_slot||'',sourceRow:raw.sourceRow||'',sourceName:sourceName,
    sourceFileId:isNative?'':(isSc?PORTAL_SC_SPREADSHEET_ID:(isSocial?PORTAL_SOCIAL_SPREADSHEET_ID:PORTAL_PN_SPREADSHEET_ID)),sourceSheet:isNative?'Portal Native':(isSc?'SUBMISSION FORM':(isSocial?'Channel Schedule 2026':'Requestor to fill in')),requestType:r.request_type||'NORMAL',urgent:String(r.request_type||'').toUpperCase()==='URGENT',
    department:r.department||team.department||'',team:team.team||r.team_name_snapshot||raw.team||raw.campaignDepartment||raw.sourceTeam||'',requestor:r.requester_email||'',campaign:r.campaign_name||'',objective:r.objective||'',
    title:item.title||'',keyMessage:item.key_message||r.business_impact||'',detail:isNative?(item.key_message||r.business_impact||''):(raw.remarks||raw.fullDescription||raw.comments||''),sourceRemarks:raw.remarks||raw.comments||'',destinationUrl:item.destination_url||'',artworkUrl:(items.find(function(x){return x.artwork_url;})||item).artwork_url||'',sellerScope:r.seller_scope||raw.sellerScope||'',
    sellerTarget:r.seller_target||raw.targetSellers||'',targetCriteria:r.target_criteria||'',targetSize:r.target_size||'',assetType:assetType,sourceAssetType:isNative?(nativeAssets.join(', ')||sourceAsset):sourceAsset,channels:isNative?nativeAssets:(raw.socialChannels||sourceAsset?[].concat(raw.socialChannels||sourceAsset):[]),sourceChannels:isNative?nativeAssets:(raw.socialChannels||sourceAsset?[].concat(raw.socialChannels||sourceAsset):[]),
    startDate:r.start_date||'',endDate:r.end_date||r.start_date||'',status:r.portal_workflow_status||r.status||r.request_status||state.canonical_status||'SUBMITTED',sourceStatus:sourceStatus,allocationStatus:state.canonical_substatus||raw.allocationStatus||'',
    completenessStatus:r.completeness_status||'',cycleId:r.cycle_id||'',editableUntil:r.editable_until||'',managerApprovalStatus:r.manager_approval_status||'NOT_REQUIRED',priorityLevel:isNative?(r.priority||''):'',priorityScore:isNative?Number(r.priority_score||0):0,tsTier:r.campaign_grade_ts||raw.opsInternalGrade||'',nsTier:r.campaign_grade_ns||raw.internalGrade||'',
    createdAt:r.created_at||'',updatedAt:r.updated_at||'',owner:item.owner_email||'',preferredTimeSlot:r.preferred_time_slot||'',timeSource:r.time_source||'NOT_SPECIFIED',sourceSystem:r.source_system||'',
    sourceRecordKey:state.source_record_key||'',sourceRuleSet:state.rule_set_id||'',sourceRuleVersion:state.rule_version||''
  };
  if(isSc){
    Object.assign(dto,{
      titleValidation:raw.titleValidation||'',contentValidation:raw.contentValidation||'',timeSensitive:raw.timeSensitive||'',artwork:raw.artwork||item.artwork_url||'',
      compliance:truth_(raw.compliance||r.compliance_required),monetary:truth_(raw.monetary||r.monetary_risk),preferredDates:raw.preferredDates||[],opsInternalGrade:raw.opsInternalGrade||'',internalGrade:raw.internalGrade||'',
      readiness:raw.readiness||null,finalistStatus:finalist?finalist.status:'',confirmedDate:finalist?finalist.confirmedDate:'',confirmedPic:finalist?finalist.pic:'',campaignId:finalist?finalist.campaignId:'',
      scheduled:finalist?truth_(finalist.scheduled):false,finalistRow:finalist?finalist.finalistRow:'',cutoff:truth_(raw.cutoff),assetApprovalStatus:raw.assetApproval?raw.assetApproval.status:'NOT_REQUIRED',assetApprovalComment:raw.assetApproval?raw.assetApproval.comment:'',assetManagerApproval:raw.assetApproval?raw.assetApproval.managerApprove:'',assetApprovalSourceRow:raw.assetApproval?raw.assetApproval.sourceRow:'',assetApprovalConflict:raw.assetApproval?truth_(raw.assetApproval.conflict):false
    });
  }else if(isSocial){
    Object.assign(dto,{socialChannel:raw.channel||'',socialChannels:raw.socialChannels||[],socialType:raw.type||'',socialObjective:raw.objective||'',socialSubject:raw.subject||'',socialMainGroup:raw.mainGroup||'',awStatus:raw.awStatus||'',aiCheck1Status:raw.aiCheck1Status||'',aiCheck2Status:raw.aiCheck2Status||'',finalLink:raw.finalLink||'',scheduleBy:raw.scheduleBy||'',gdPic:raw.gdPic||'',weekNo:raw.weekNo||''});
  }else{
    Object.assign(dto,{confirmedCommType:raw.confirmedCommType||'',formulaStatus:raw.formulaStatus||'',sourceDecision:raw.sourceDecision||'',slotId:raw.slotId||'',remark:raw.remark||''});
  }
  return dto;
}

function campaignSourceKey_(request){
  const s=String(request.sourceSystem||'').toUpperCase(),n=String(request.sourceName||'').toUpperCase();
  if(s==='GOOGLE_SHEETS_SC'||n==='SCA')return 'SCA';
  if(s==='GOOGLE_SHEETS_SOCIAL'||n==='SOCIAL MEDIA')return 'SOCIAL';
  if(s==='GOOGLE_SHEETS_PN'||n==='PN')return 'PN';
  return 'PORTAL';
}
function normalizeCampaignKey_(name){
  return String(name||'').toLowerCase().replace(/\(\s*content\s*\d+\s*\)\s*$/i,'').replace(/\bcontent\s*\d+\s*$/i,'').replace(/[\s_\-–—]+/g,' ').replace(/[^a-z0-9ก-๙ .&/+]/gi,'').trim();
}
function buildCampaign360_(requests){
  const map={};
  (requests||[]).forEach(function(r){
    const name=String(r.campaign||'').trim();if(!name)return;const key=normalizeCampaignKey_(name)||normLower_(name);if(!map[key])map[key]={id:'CMP-'+shortHash_(key,12).toUpperCase(),key:key,name:name,requestIds:[],sources:[],assets:[],departments:[],teams:[],requesters:[],statuses:[],campaignIds:[],startDate:'',endDate:'',assetApproval:{approved:0,pending:0,rejected:0,conflict:0,notRequired:0}};
    const c=map[key],src=campaignSourceKey_(r);c.requestIds.push(r.id);if(c.sources.indexOf(src)<0)c.sources.push(src);if(r.sourceAssetType&&c.assets.indexOf(r.sourceAssetType)<0)c.assets.push(r.sourceAssetType);if(r.department&&c.departments.indexOf(r.department)<0)c.departments.push(r.department);if(r.team&&c.teams.indexOf(r.team)<0)c.teams.push(r.team);if(r.requestor&&c.requesters.indexOf(r.requestor)<0)c.requesters.push(r.requestor);if(r.status&&c.statuses.indexOf(r.status)<0)c.statuses.push(r.status);if(r.campaignId&&c.campaignIds.indexOf(r.campaignId)<0)c.campaignIds.push(r.campaignId);
    const sd=dateIso_(asDate_(r.startDate)),ed=dateIso_(asDate_(r.endDate||r.startDate));if(sd&&(!c.startDate||sd<c.startDate))c.startDate=sd;if(ed&&(!c.endDate||ed>c.endDate))c.endDate=ed;
    if(src==='SCA'){const a=normUpper_(r.assetApprovalStatus);if(/CONFLICT/.test(a))c.assetApproval.conflict++;else if(/REJECT/.test(a))c.assetApproval.rejected++;else if(/APPROV/.test(a))c.assetApproval.approved++;else if(/PENDING|REVIEW/.test(a))c.assetApproval.pending++;else c.assetApproval.notRequired++;}
  });
  return Object.keys(map).map(function(k){const c=map[k];c.requestCount=c.requestIds.length;c.sourceCount=c.sources.length;c.status=campaignRollupStatus_(c.statuses);return c;}).sort(function(a,b){return String(b.startDate||'').localeCompare(String(a.startDate||''))||a.name.localeCompare(b.name);});
}
function campaignRollupStatus_(statuses){const s=(statuses||[]).map(normUpper_);if(!s.length)return 'SUBMITTED';if(s.every(function(x){return ['PUBLISHED','COMPLETED'].indexOf(x)>=0;}))return 'PUBLISHED';if(s.indexOf('SCHEDULED')>=0)return 'SCHEDULED';if(s.indexOf('IN_PRODUCTION')>=0)return 'IN_PRODUCTION';if(s.indexOf('APPROVED')>=0||s.indexOf('FINALIST')>=0)return 'APPROVED';if(s.indexOf('IN_REVIEW')>=0)return 'IN_REVIEW';if(s.indexOf('REJECTED')>=0&&s.every(function(x){return ['REJECTED','CANCELLED'].indexOf(x)>=0;}))return 'REJECTED';return 'SUBMITTED';}

function readObjects_(id,sheetName){const sh=SpreadsheetApp.openById(id).getSheetByName(sheetName);if(!sh||sh.getLastRow()<2)return[];const vals=sh.getDataRange().getDisplayValues(),headers=vals.shift();return vals.filter(r=>r.some(Boolean)).map(r=>{const o={};headers.forEach((h,i)=>{if(h)o[h]=r[i]});return o});}
function normalizeConfigRows_(rows){return (rows||[]).map(function(r){return {id:String(r.key||'').toLowerCase(),key:r.key||'',value:r.value||'',description:r.description||'',updatedAt:r.updated_at||'',updatedBy:r.updated_by||''};});}
function shortLinkPolicyFromConfig_(rows){const m={};(rows||[]).forEach(function(r){m[String(r.key||'')]=r.value;});return {provider:m.SHORT_LINK_PROVIDER||'TINYURL_FREE',domain:m.SHORT_LINK_BASE_URL||'https://tinyurl.com',aliasMode:m.SHORT_LINK_ALIAS_MODE||'AUTO_OR_CUSTOM',analytics:false,paidFeatures:false,legacyPolicy:m.SHORT_LINK_LEGACY_PARAM_POLICY||'STRIP_EXACT_LEGACY'};}
function normalizeTrackingLinks_(rows){return (rows||[]).slice().reverse().slice(0,500).map(function(r){return {code:r.tracking_id||'',trackingId:r.tracking_id||'',requestId:r.request_id||'',commsItemId:r.comms_item_id||'',destination:r.generated_url||'',generatedUrl:r.generated_url||'',originalUrl:r.original_url||'',shortUrl:r.short_url||'',shortProvider:String(r.link_type||'').toUpperCase()==='TINYURL_FREE'?'TINYURL_FREE':'',customAlias:r.external_reference_id||'',status:r.status||'',source:r.utm_source||'',medium:r.utm_medium||'',campaign:r.utm_campaign||'',content:r.utm_content||'',term:r.utm_term||'',clicks:null,createdAt:r.created_at||'',createdBy:r.created_by||''};});}
function normalizeContentInsights_(rows){return (rows||[]).slice().reverse().slice(0,1000).map(function(r){return {id:r.insight_id||'',requestId:r.request_id||'',context:r.context_summary||'',objective:r.objective_summary||'',tone:r.tone_vibes||'',target:r.target_summary||'',benefit:r.benefit_summary||'',keywords:String(r.keyword_suggestions||'').split('|').filter(Boolean),mode:r.analysis_mode||'',modelRef:r.model_ref||'',updatedAt:r.updated_at||''};});}
function normalizeChannelRules_(rows){return (rows||[]).filter(function(r){return String(r.active||'').toUpperCase()!=='FALSE';}).map(function(r){return {key:r.channel_key||'',module:r.module||'',asset:r.subtype_or_asset||'',artworkRule:r.artwork_rule||'NOT_REQUIRED',titleMax:Number(r.title_max||0),bodyMax:Number(r.body_max||0),trackingRule:r.tracking_rule||'',targetWidth:Number(r.artwork_width||0)||null,targetHeight:Number(r.artwork_height||0)||null,maxFileMb:Number(r.artwork_max_mb||0)||null};});}
function normalizeUsers_(rows,teams){const teamMap={};(teams||[]).forEach(t=>{teamMap[String(t.team_id||'')]={department:String(t.department||''),team:String(t.team_name||''),managerEmail:String(t.manager_email||'')}});return (rows||[]).filter(r=>String(r.email||'').trim()||String(r.source_identity||'').trim()).map(r=>{const t=teamMap[String(r.team_id||'')]||{};return {id:r.user_id||'',email:r.email||'',name:r.display_name||r.source_identity||r.email||'',displayName:r.display_name||'',teamId:r.team_id||'',role:r.role||'REQUESTER',status:r.status||'INACTIVE',active:String(r.status||'').toUpperCase()==='ACTIVE',department:t.department||'',team:t.team||'',managerEmail:r.manager_email||t.managerEmail||'',sourceIdentity:r.source_identity||'',pnCount:Number(r.pn_count||0),pnarCount:Number(r.pnar_count||0),emailCount:Number(r.email_count||0),scCount:Number(r.sc_count||0),totalRequests:Number(r.total_requests||0),latestRequestDate:r.latest_request_date||'',identityStatus:r.identity_status||'',canReviewPn:String(r.can_review_pn||'').toUpperCase()==='TRUE',canReviewSc:String(r.can_review_sc||'').toUpperCase()==='TRUE',canReviewArtwork:String(r.can_review_artwork||'').toUpperCase()==='TRUE',canManageCycles:String(r.can_manage_cycles||'').toUpperCase()==='TRUE',canManageNotifications:String(r.can_manage_notifications||'').toUpperCase()==='TRUE'};});}
function normalizeUserImportJobs_(rows){return (rows||[]).slice().reverse().slice(0,50).map(r=>({id:r.import_job_id||'',fileName:r.file_name||'',mode:r.import_mode||'',total:Number(r.total_rows||0),valid:Number(r.valid_rows||0),inserted:Number(r.inserted_rows||0),updated:Number(r.updated_rows||0),skipped:Number(r.skipped_rows||0),errors:Number(r.error_rows||0),status:r.status||'',startedAt:r.started_at||'',completedAt:r.completed_at||'',createdBy:r.created_by||'',templateVersion:r.template_version||''}));}
function normalizeCycles_(rows){return rows.map(r=>({id:r.cycle_id,ruleId:r.cycle_rule_id,channelGroup:r.channel_group,requestType:r.request_type,status:r.status,cutoffAt:dateTimeIso_(r.cutoff_at),windowStart:r.comm_window_start,windowEnd:r.comm_window_end,reviewerDueAt:dateTimeIso_(r.reviewer_due_at),revisionDueAt:dateTimeIso_(r.revision_due_at),finalistDueAt:dateTimeIso_(r.finalist_due_at),overrideScope:r.override_scope}));}
function normalizeCycleRules_(rows){return rows.filter(r=>String(r.active).toUpperCase()!=='FALSE'&&r.request_type==='NORMAL').map(r=>({id:r.rule_id,channelGroup:r.channel_group,label:r.channel_group==='PN_EDM'?'PN / PNAR / EDM':'SC',cutoffWeekday:title_(r.cutoff_weekday),cutoffTime:r.cutoff_time,reminderOffsets:r.reminder_offsets_hours,window:'Next Monday – Sunday',finalist:r.default_finalist_weekday?(title_(r.default_finalist_weekday)+' '+r.default_finalist_time):''}));}
function normalizeNotificationRules_(rows){return rows.filter(r=>String(r.active).toUpperCase()!=='FALSE').map(r=>({id:r.notification_rule_id,eventType:r.event_type,channelGroup:r.channel_group,offsetHours:Math.abs(Number(r.offset_minutes||0))/60,email:String(r.email_enabled).toUpperCase()!=='FALSE',portal:String(r.portal_enabled).toUpperCase()!=='FALSE'}));}
function buildTeamLookup_(requests){const seen={},out=[];requests.forEach(r=>{if(!r.department||!r.team)return;const k=r.department+'|'+r.team.toLowerCase();if(seen[k])return;seen[k]=1;out.push({department:r.department,team:r.team})});return out.sort((a,b)=>(a.department+a.team).localeCompare(b.department+b.team));}
function cycleForDate_(d,group){if(!d)return'';const t=d.getTime();if(t>=new Date(2026,8,7).getTime()&&t<=new Date(2026,8,13,23,59,59).getTime())return group==='SC'?'CYCLE-SC-2026-W36':'CYCLE-PN-2026-W36';return'';}
function editableUntil_(d,group){return cycleForDate_(d,group)?(group==='SC'?'2026-09-01T15:00:00+07:00':'2026-09-01T12:00:00+07:00'):'';}
function scCompositeKey_(business,team,campaign,requestor,asset,date){return [business,team,campaign,requestor,asset,date?dateIso_(date):''].map(x=>String(x||'').trim().toLowerCase()).join('|');}
function truth_(v){return v===true||/^(true|yes|y|1)$/i.test(String(v||'').trim());}
function department_(v){v=String(v||'').trim();return ['BD','MKT','OPS','Other Entities'].indexOf(v)>-1?v:(v?'Other Entities':'');}
function asDate_(v){if(v instanceof Date&&!isNaN(v))return v;if(!v)return null;const d=new Date(v);return isNaN(d)?null:d;}
function dateIso_(v){return v?Utilities.formatDate(v,'Asia/Bangkok','yyyy-MM-dd'):'';}
function dateTimeIso_(v){if(!v)return'';const d=asDate_(v);return d?Utilities.formatDate(d,'Asia/Bangkok',"yyyy-MM-dd'T'HH:mm:ssXXX"):String(v).replace(' ','T')+'+07:00';}
function timeSlotFromText_(v){const m=String(v||'').match(/(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?:\D|$)/);if(!m)return'';const h=Number(m[1]);if(h>=9&&h<12)return'09:00-11:59';if(h>=12&&h<15)return'12:00-14:59';if(h>=15&&h<18)return'15:00-17:59';if(h>=18&&h<21)return'18:00-20:59';return'';}
function unique_(arr){const seen={};return arr.map(x=>String(x||'').trim()).filter(x=>x&&!seen[x]&&(seen[x]=true)).sort();}
function pad_(v,n){return String(v).padStart(n,'0');}
function title_(v){v=String(v||'').toLowerCase();return v?v.charAt(0).toUpperCase()+v.slice(1):'';}
function sanitizeCallback_(v){v=String(v||'');return /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(v)?v:'portalSyncCallback';}
