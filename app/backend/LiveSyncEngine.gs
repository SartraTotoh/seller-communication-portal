/**
 * Seller Communication Portal - Live Sync Engine v3.0
 *
 * Source of truth during coexistence:
 *   - PN / PNAR / EDM: [2026] Seller Comm Request Tracker
 *   - SCA: [TH] Seller Centre Asset SCA Request & Allocation
 *   - Social Media: 1. New Channel Landscape dashboard 2026 - Seller Education
 *
 * Safety invariants:
 *   1) Source trackers are READ ONLY. This file never calls setValue/appendRow on source workbooks.
 *   2) Empty / structural / NA / unusable rows are excluded from active Portal feed but audited.
 *   3) SCA status is evaluated at Request ID + Asset Type level; validation/readiness is separate from approval/allocation evidence.
 *   4) Status events are appended only when normalized source state changes.
 *   5) Portal-native rows are preserved; source sync only owns rows whose source_system starts GOOGLE_SHEETS_.
 */
const PORTAL_LIVE_SYNC_VERSION = '3.0.0';
const PORTAL_SYNC_TRIGGER_HANDLER = 'runPortalLiveSyncTrigger';
const PORTAL_SYNC_SOURCE_PN = 'SRC-PN-REQUEST';
const PORTAL_SYNC_SOURCE_SC = 'SRC-SC-REQUEST';
const PORTAL_SYNC_SOURCE_SOCIAL = 'SRC-SOCIAL-2026';
const PORTAL_SYNC_RULESET_PN = 'RULESET-PN-STATUS-V2';
const PORTAL_SYNC_RULESET_SC = 'RULESET-SC-STATUS-V3';
const PORTAL_SYNC_RULESET_SOCIAL = 'RULESET-SOCIAL-STATUS-V1';

function portalSetupTriggerTag_() {
  return 'SETUP_V' + String(PORTAL_BACKEND_RELEASE || '').replace(/\D/g, '');
}

function setupPortalLiveSync() {
  const email = portalCurrentEmail_();
  // v4.8.0 bootstrap self-heal: the bundled People seed is deterministic and Portal-DB only.
  // Repair People/Users first so a stale COMPLETED flag or a partial prior import cannot deadlock Admin setup.
  ensurePeopleSchema_();
  const peopleSeed = ensurePeopleSeedV480ForSetup_(email);
  assertAdminUser_(email);
  ensurePortalCloseoutSchema_();
  const cfg = liveSyncConfig_();
  const validation = validatePortalLiveSyncAccess_();
  ensureContentOpsSchema_();

  // Trigger installation is protected, but the lock is released before the initial sync.
  // Apps Script locks are not re-entrant, so holding this lock while runPortalLiveSync()
  // acquires its own lock would block the one-click setup flow.
  const setupLock = LockService.getScriptLock();
  setupLock.waitLock(30000);
  try {
    installPortalLiveSyncTrigger_(cfg.triggerMinutes);
    const endpoint = safeServiceUrl_();
    if (endpoint) upsertConfigValue_('TRACKER_SYNC_ENDPOINT', endpoint, 'Apps Script Live Sync Web App endpoint used by Firebase Hosting.', email);
    upsertConfigValue_('LIVE_SYNC_SETUP_VERSION', PORTAL_LIVE_SYNC_VERSION, 'Installed Live Sync Engine version.', email);
    upsertConfigValue_('LIVE_SYNC_SETUP_STATUS', 'INITIAL_SYNC', 'One-click setup installed; initial PN + SCA + Social reconciliation is running.', email);
  } finally {
    setupLock.releaseLock();
  }

  const result = runPortalLiveSync({force:true, triggeredBy:portalSetupTriggerTag_(), actor:email});
  const endpoint = safeServiceUrl_();
  const usersNow = readObjects_(PORTAL_DB_SPREADSHEET_ID, 'Users').filter(function(r){ return corporateEmail_(r.email || r.source_identity); });
  const activeUsersNow = usersNow.filter(function(r){ return String(r.status || '').toUpperCase() === 'ACTIVE'; });
  const requestsNow = readObjects_(PORTAL_DB_SPREADSHEET_ID, 'Requests').filter(activePortalRequest_);
  const checkpointsNow = readObjects_(PORTAL_DB_SPREADSHEET_ID, 'Sync_Checkpoints');
  const pnCheckpoint = checkpointsNow.some(function(r){ return String(r.source_id || '') === PORTAL_SYNC_SOURCE_PN && String(r.status || '').toUpperCase() === 'SUCCESS'; });
  const scCheckpoint = checkpointsNow.some(function(r){ return String(r.source_id || '') === PORTAL_SYNC_SOURCE_SC && String(r.status || '').toUpperCase() === 'SUCCESS'; });
  const socialCheckpoint = checkpointsNow.some(function(r){ return String(r.source_id || '') === PORTAL_SYNC_SOURCE_SOCIAL && String(r.status || '').toUpperCase() === 'SUCCESS'; });
  if (activeUsersNow.length < PEOPLE_SEED_V474_EXPECTED) throw new Error('Setup verification failed: People & Roles has only '+activeUsersNow.length+' active users; expected '+PEOPLE_SEED_V474_EXPECTED+'.');
  if (!pnCheckpoint || !scCheckpoint || !socialCheckpoint) throw new Error('Setup verification failed: PN, SCA and Social successful sync checkpoints were not all created.');
  if (!requestsNow.length) throw new Error('Setup verification failed: source trackers were reachable but zero active Portal requests were reconciled.');
  upsertConfigValue_('LIVE_SYNC_SETUP_STATUS', 'READY', 'v'+PORTAL_BACKEND_RELEASE+' verified People + Admin + PN + SCA + Social data, Asset Approval logic and production schemas.', email);
  upsertConfigValue_('LIVE_SYNC_SETUP_RELEASE', PORTAL_BACKEND_RELEASE, 'Verified backend release after recovery setup.', email);
  return {
    ok:true,
    version:PORTAL_LIVE_SYNC_VERSION,
    release:PORTAL_BACKEND_RELEASE,
    endpoint:endpoint,
    triggerMinutes:cfg.triggerMinutes,
    validation:validation,
    sync:result,
    peopleSeed:peopleSeed,
    verification:{activeUsers:activeUsersNow.length,requests:requestsNow.length,pnCheckpoint:pnCheckpoint,scCheckpoint:scCheckpoint,socialCheckpoint:socialCheckpoint},
    message:'Live Sync is ready. People & Roles and PN + SCA + Social source data are verified; all source trackers remain read-only.'
  };
}

function runPortalLiveSyncTrigger() {
  return runPortalLiveSync({force:false, triggeredBy:'TRIGGER', actor:'SYSTEM_TRIGGER'});
}

function runPortalLiveSync(options) {
  options = options || {};
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(options.force ? 30000 : 1000)) {
    return {ok:true, skipped:true, reason:'SYNC_ALREADY_RUNNING'};
  }
  const started = new Date();
  try {
    const cfg = liveSyncConfig_();
    const db = SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID);
    const pnFile = DriveApp.getFileById(PORTAL_PN_SPREADSHEET_ID);
    const scFile = DriveApp.getFileById(PORTAL_SC_SPREADSHEET_ID);
    const socialFile = DriveApp.getFileById(PORTAL_SOCIAL_SPREADSHEET_ID);
    const checkpoints = tableObjectsRaw_(db, 'Sync_Checkpoints');
    const force = !!options.force;
    const pnNeeds = force || sourceModifiedAfterCheckpoint_(checkpoints, PORTAL_SYNC_SOURCE_PN, pnFile.getLastUpdated());
    const scNeeds = force || sourceModifiedAfterCheckpoint_(checkpoints, PORTAL_SYNC_SOURCE_SC, scFile.getLastUpdated());
    const socialNeeds = force || sourceModifiedAfterCheckpoint_(checkpoints, PORTAL_SYNC_SOURCE_SOCIAL, socialFile.getLastUpdated());
    const summaries = [];

    if (pnNeeds) {
      const pnParsed = parsePnSource_(cfg, pnFile.getLastUpdated());
      summaries.push(reconcileSource_(db, PORTAL_SYNC_SOURCE_PN, PORTAL_SYNC_RULESET_PN, 2, pnParsed, pnFile.getLastUpdated(), options));
    } else {
      summaries.push({sourceId:PORTAL_SYNC_SOURCE_PN, skipped:true, reason:'SOURCE_UNCHANGED'});
    }

    if (scNeeds) {
      const scParsed = parseScSource_(cfg, scFile.getLastUpdated(), db);
      summaries.push(reconcileSource_(db, PORTAL_SYNC_SOURCE_SC, PORTAL_SYNC_RULESET_SC, 3, scParsed, scFile.getLastUpdated(), options));
    } else {
      summaries.push({sourceId:PORTAL_SYNC_SOURCE_SC, skipped:true, reason:'SOURCE_UNCHANGED'});
    }

    if (socialNeeds) {
      const socialParsed = parseSocialSource_(cfg, socialFile.getLastUpdated());
      summaries.push(reconcileSource_(db, PORTAL_SYNC_SOURCE_SOCIAL, PORTAL_SYNC_RULESET_SOCIAL, 1, socialParsed, socialFile.getLastUpdated(), options));
    } else {
      summaries.push({sourceId:PORTAL_SYNC_SOURCE_SOCIAL, skipped:true, reason:'SOURCE_UNCHANGED'});
    }

    portalClearDataCache_();
    const finished = new Date();
    upsertConfigValue_('LIVE_SYNC_LAST_SUCCESS_AT', formatDateTime_(finished), 'Latest successful PN + SCA + Social reconciliation timestamp.', options.actor || 'sync-engine');
    return {
      ok:true,
      version:PORTAL_LIVE_SYNC_VERSION,
      forced:force,
      startedAt:started.toISOString(),
      finishedAt:finished.toISOString(),
      durationMs:finished.getTime()-started.getTime(),
      sources:summaries
    };
  } catch (err) {
    try { upsertConfigValue_('LIVE_SYNC_LAST_ERROR', String(err && err.message ? err.message : err).slice(0,500), 'Latest Live Sync error.', options.actor || 'sync-engine'); } catch (ignore) {}
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/** Called by portalData / portalMeta. Cheap when sources are unchanged. */
function ensureFreshPortalSnapshot_() {
  const db = SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID);
  const checkpoints = tableObjectsRaw_(db, 'Sync_Checkpoints');
  const pnUpdated = DriveApp.getFileById(PORTAL_PN_SPREADSHEET_ID).getLastUpdated();
  const scUpdated = DriveApp.getFileById(PORTAL_SC_SPREADSHEET_ID).getLastUpdated();
  const socialUpdated = DriveApp.getFileById(PORTAL_SOCIAL_SPREADSHEET_ID).getLastUpdated();
  const stale = sourceModifiedAfterCheckpoint_(checkpoints, PORTAL_SYNC_SOURCE_PN, pnUpdated) || sourceModifiedAfterCheckpoint_(checkpoints, PORTAL_SYNC_SOURCE_SC, scUpdated) || sourceModifiedAfterCheckpoint_(checkpoints, PORTAL_SYNC_SOURCE_SOCIAL, socialUpdated);
  if (!stale) return {fresh:true, synced:false};
  try {
    const result = runPortalLiveSync({force:false, triggeredBy:'PORTAL_CHECK', actor:'PORTAL_CHECK'});
    return {fresh:true, synced:!result.skipped, result:result};
  } catch (err) {
    return {fresh:false, synced:false, error:String(err && err.message ? err.message : err)};
  }
}

function validatePortalLiveSyncAccess_() {
  const db = SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID);
  const pn = SpreadsheetApp.openById(PORTAL_PN_SPREADSHEET_ID);
  const sc = SpreadsheetApp.openById(PORTAL_SC_SPREADSHEET_ID);
  const social = SpreadsheetApp.openById(PORTAL_SOCIAL_SPREADSHEET_ID);
  const requiredDb = ['Config','Requests','Comms_Items','Ticket_Events','Teams','Sync_Record_State','Sync_Runs','Sync_Checkpoints','Sync_Exclusions','Status_Rule_Sets','Status_Rules'];
  requiredDb.forEach(function(name){ if (!db.getSheetByName(name)) throw new Error('Portal DB sheet missing: '+name); });
  if (!pn.getSheetByName('Requestor to fill in')) throw new Error('PN source tab missing: Requestor to fill in');
  if (!sc.getSheetByName('SUBMISSION FORM')) throw new Error('SC source tab missing: SUBMISSION FORM');
  if (!sc.getSheetByName('FINALIST')) throw new Error('SCA source tab missing: FINALIST');
  if (!sc.getSheetByName('PopUp Request Approval')) throw new Error('SCA source tab missing: PopUp Request Approval');
  if (!social.getSheetByName('Channel Schedule 2026')) throw new Error('Social source tab missing: Channel Schedule 2026');
  return {database:true,pn:true,sc:true,social:true};
}

function installPortalLiveSyncTrigger_(minutes) {
  minutes = [1,5,10,15,30].indexOf(Number(minutes)) >= 0 ? Number(minutes) : 5;
  ScriptApp.getProjectTriggers().forEach(function(trigger){
    if (trigger.getHandlerFunction() === PORTAL_SYNC_TRIGGER_HANDLER) ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger(PORTAL_SYNC_TRIGGER_HANDLER).timeBased().everyMinutes(minutes).create();
}

function safeServiceUrl_() {
  try { return String(ScriptApp.getService().getUrl() || ''); } catch (err) { return ''; }
}

function liveSyncConfig_() {
  const rows = readObjects_(PORTAL_DB_SPREADSHEET_ID, 'Config');
  const map = {};
  rows.forEach(function(r){ map[String(r.key||'')] = r.value; });
  return {
    year:Number(map.LIVE_SYNC_FILTER_YEAR || PORTAL_FILTER_YEAR || 2026),
    triggerMinutes:Number(map.SYNC_TRIGGER_MINUTES || 5),
    pnExcludedStates:String(map.PN_EXCLUDED_SOURCE_STATES || 'NA|N/A').split('|').map(normUpper_).filter(Boolean),
    pnStatusMap:parseJsonSafe_(map.PN_STATUS_MAP, {
      CANCEL:'CANCELLED', REJECT:'REJECTED', PENDING:'INCOMPLETE', COMPLETED_NO_DECISION:'READY_FOR_REVIEW', COMPLETED_CONFIRMED:'APPROVED', SLOT_ASSIGNED:'SCHEDULED', DEFAULT:'SUBMITTED'
    }),
    scStatusMap:parseJsonSafe_(map.SC_STATUS_MAP, {
      CANCEL:'CANCELLED', REJECT:'REJECTED', FULL_SLOT:'REJECTED', QC_PROCESS:'IN_REVIEW', READY:'FINALIST', READY_SCHEDULED:'SCHEDULED', WAITING_CUTOFF:'SUBMITTED', PENDING_ALLOCATION:'READY_FOR_CUTOFF', INCOMPLETE:'INCOMPLETE'
    }),
    socialStatusMap:parseJsonSafe_(map.SOCIAL_STATUS_MAP, {PUBLISHED:'PUBLISHED',DONE:'COMPLETED',SCHEDULED:'SCHEDULED',READY:'READY_FOR_REVIEW',HOLD:'SUBMITTED',WAITING:'SUBMITTED',POSTPONED:'SUBMITTED',WORKING:'IN_PRODUCTION',BRIEFED:'IN_PRODUCTION',TENTATIVE:'SUBMITTED',PENDING:'SUBMITTED',CANCEL:'CANCELLED',CANCELLED:'CANCELLED',DEFAULT:'SUBMITTED'}),
    weekScope:String(map.SYNC_WEEK_SCOPE || 'CALENDAR_WEEK_AND_ACTIVE_CYCLE'),
    qualityEnabled:String(map.SYNC_QUALITY_GATE_ENABLED || 'ENABLED').toUpperCase() !== 'DISABLED',
    pnRequireIdentity:String(map.PN_QUALITY_REQUIRE_IDENTITY || 'ENABLED').toUpperCase() !== 'DISABLED',
    pnRequirePayload:String(map.PN_QUALITY_REQUIRE_PAYLOAD || 'ENABLED').toUpperCase() !== 'DISABLED',
    pnRequireSourceState:String(map.PN_REQUIRE_SOURCE_STATE || 'ENABLED').toUpperCase() !== 'DISABLED',
    scRequireRequestId:String(map.SC_QUALITY_REQUIRE_REQUEST_ID || 'ENABLED').toUpperCase() !== 'DISABLED',
    scRequirePreferredDate:String(map.SC_QUALITY_REQUIRE_PREFERRED_DATE || 'ENABLED').toUpperCase() !== 'DISABLED',
    scRequireIdentity:String(map.SC_QUALITY_REQUIRE_IDENTITY || 'ENABLED').toUpperCase() !== 'DISABLED',
    scRequirePayload:String(map.SC_QUALITY_REQUIRE_PAYLOAD || 'ENABLED').toUpperCase() !== 'DISABLED',
    scRequireTitlePass:String(map.SC_READINESS_REQUIRE_TITLE_PASS || 'ENABLED').toUpperCase() !== 'DISABLED',
    scRequireContentPass:String(map.SC_READINESS_REQUIRE_CONTENT_PASS || 'ENABLED').toUpperCase() !== 'DISABLED',
    scRequireDestination:String(map.SC_READINESS_REQUIRE_DESTINATION || 'ENABLED').toUpperCase() !== 'DISABLED'
  };
}

function parsePnSource_(cfg, sourceModifiedAt) {
  const ss = SpreadsheetApp.openById(PORTAL_PN_SPREADSHEET_ID);
  const sh = ss.getSheetByName('Requestor to fill in');
  const last = sh.getLastRow();
  const records = [], exclusions = [];
  if (last < 11) return {records:records, exclusions:exclusions, scannedRows:0};
  const values = sh.getRange(11,1,last-10,20).getValues(); // A:T, header row 10
  values.forEach(function(r, idx){
    const rowNumber = idx + 11;
    const date = asDate_(r[0]);
    if (!date || date.getFullYear() !== cfg.year) return;
    const source = {
      preferredDate:date,
      department:String(r[1]||'').trim(),
      team:String(r[2]||'').trim(),
      requesterEmail:String(r[3]||'').trim(),
      campaign:String(r[4]||'').trim(),
      objective:String(r[5]||'').trim(),
      keyMessage:String(r[6]||'').trim(),
      destinationUrl:String(r[7]||'').trim(),
      sellerTarget:String(r[8]||'').trim(),
      targetCriteria:String(r[9]||'').trim(),
      targetSize:String(r[10]||'').trim(),
      pic:String(r[11]||'').trim(),
      requestedCommType:String(r[12]||'').trim(),
      requestedCount:String(r[13]||'').trim(),
      preferredTime1:String(r[14]||'').trim(),
      preferredTime2:String(r[15]||'').trim(),
      confirmedCommType:String(r[16]||'').trim(),
      remark:String(r[17]||'').trim(),
      formulaStatus:String(r[18]||'').trim(),
      slotId:String(r[19]||'').trim()
    };
    const naturalKey = [dateIso_(date),normLower_(source.requesterEmail),normLower_(source.campaign),normLower_(source.team)].join('|');
    const sourceRecordKey = 'PN|' + shortHash_(naturalKey,24);
    const q = evaluatePnQuality_(source, cfg);
    if (!q.include) {
      exclusions.push(makeExclusion_(PORTAL_SYNC_SOURCE_PN, sourceRecordKey, 'Requestor to fill in!'+rowNumber, '', q.code, q.reason, PORTAL_SYNC_RULESET_PN, 2, source, sourceModifiedAt));
      return;
    }
    const s = evaluatePnStatus_(source, cfg);
    const portalRequestId = 'PN-' + shortHash_(naturalKey,14).toUpperCase();
    const portalCommsItemId = 'PNCI-' + shortHash_(portalRequestId+'|PN_EDM',12).toUpperCase();
    const explicitTime = timeSlotFromText_(source.preferredTime1) || timeSlotFromText_(source.preferredTime2);
    const requestFields = {
      request_id:portalRequestId,
      legacy_slot:source.slotId || '',
      campaign_name:source.campaign,
      objective:source.objective,
      requester_email:source.requesterEmail,
      team_id:'',
      department:department_(source.department),
      priority:'UNSCORED',
      status:s.status,
      business_impact:source.keyMessage,
      compliance_required:'FALSE',
      monetary_risk:'FALSE',
      launch_dependency:'',
      start_date:dateIso_(date),
      end_date:dateIso_(date),
      seller_scope:'',
      seller_target:source.sellerTarget,
      target_criteria:source.targetCriteria,
      target_size:source.targetSize,
      created_at:date,
      updated_at:'',
      closed_at:'',
      parent_request_id:'',
      request_type:'NORMAL',
      cycle_id:cycleForDate_(date,'PN_EDM'),
      completeness_status:normUpper_(source.formulaStatus)==='COMPLETED'?'COMPLETE':'INCOMPLETE',
      editable_until:editableUntil_(date,'PN_EDM'),
      locked_at:'', revision_due_at:'', manager_approval_status:'NOT_REQUIRED', manager_approver_email:'', manager_approved_at:'',
      preferred_time_slot:explicitTime,
      time_source:explicitTime?'SOURCE_EXPLICIT':'NOT_SPECIFIED',
      source_system:'GOOGLE_SHEETS_PN'
    };
    const asset = source.confirmedCommType || source.requestedCommType || 'PN / EDM';
    const commsFields = {
      comms_item_id:portalCommsItemId, request_id:portalRequestId, channel_group:'PN_EDM', module:'PN / EDM', asset_type:asset,
      title:source.campaign, key_message:source.keyMessage, destination_url:source.destinationUrl, owner_email:source.pic || '', reviewer_email:'', approver_email:'',
      status:s.status, scheduled_at:'', published_at:'', artwork_url:'', current_version:1, created_at:date, updated_at:''
    };
    const sourceStatus = Object.assign({}, source, {sourceDecision:s.decision, canonicalSubstatus:s.substatus, sourceRow:rowNumber});
    records.push(makeSyncRecord_(PORTAL_SYNC_SOURCE_PN, sourceRecordKey, 'Requestor to fill in!'+rowNumber, '', portalRequestId, portalCommsItemId, requestFields, commsFields, sourceStatus, s.status, s.substatus, PORTAL_SYNC_RULESET_PN, 2, sourceModifiedAt));
  });
  return {records:records, exclusions:exclusions, scannedRows:values.length};
}

function evaluatePnQuality_(s, cfg) {
  if (!cfg.qualityEnabled) return {include:true};
  const excluded = cfg.pnExcludedStates || ['NA','N/A'];
  const formula = normUpper_(s.formulaStatus), decision = normUpper_(s.confirmedCommType);
  if (excluded.indexOf(formula) >= 0 || excluded.indexOf(decision) >= 0) return {include:false,code:'STRUCTURAL_OR_NA',reason:'Source Formula / Confirmed Comms type is NA or N/A.'};
  if (cfg.pnRequireIdentity && (!s.requesterEmail || !s.campaign)) return {include:false,code:'MISSING_IDENTITY',reason:'Requester Email or Campaign name is missing.'};
  const meaningful = [s.objective,s.keyMessage,s.destinationUrl,s.sellerTarget,s.targetCriteria,s.requestedCommType].some(nonBlank_);
  if (cfg.pnRequirePayload && !meaningful) return {include:false,code:'INSUFFICIENT_PAYLOAD',reason:'Row has no meaningful request payload.'};
  const state = [s.formulaStatus,s.confirmedCommType,s.remark,s.slotId].some(nonBlank_);
  if (cfg.pnRequireSourceState && !state) return {include:false,code:'NO_SOURCE_STATE',reason:'No usable source workflow state is present.'};
  return {include:true};
}

function evaluatePnStatus_(s, cfg) {
  const map = cfg.pnStatusMap;
  if (/cancel/i.test(s.remark)) return {status:map.CANCEL||'CANCELLED', substatus:'SOURCE_CANCEL', decision:'CANCEL'};
  if (/^reject$/i.test(s.confirmedCommType)) return {status:map.REJECT||'REJECTED', substatus:'SOURCE_REJECT', decision:'REJECT'};
  if (s.slotId) return {status:map.SLOT_ASSIGNED||'SCHEDULED', substatus:'SOURCE_SLOT_ASSIGNED', decision:'SLOT_ASSIGNED'};
  if (/^pending$/i.test(s.formulaStatus)) return {status:map.PENDING||'INCOMPLETE', substatus:'MISSING_REQUIRED_FIELDS', decision:'PENDING'};
  if (/^completed$/i.test(s.formulaStatus) && s.confirmedCommType) return {status:map.COMPLETED_CONFIRMED||'APPROVED', substatus:'CHANNEL_CONFIRMED', decision:'COMPLETED_CONFIRMED'};
  if (/^completed$/i.test(s.formulaStatus)) return {status:map.COMPLETED_NO_DECISION||'READY_FOR_REVIEW', substatus:'SOURCE_COMPLETE', decision:'COMPLETED_NO_DECISION'};
  return {status:map.DEFAULT||'SUBMITTED', substatus:'SOURCE_SUBMITTED', decision:'DEFAULT'};
}

function parseScSource_(cfg, sourceModifiedAt, db) {
  const ss = SpreadsheetApp.openById(PORTAL_SC_SPREADSHEET_ID);
  const sub = ss.getSheetByName('SUBMISSION FORM');
  const fin = ss.getSheetByName('FINALIST');
  const records = [], exclusions = [];
  const channelRules = scChannelRuleMap_(db);
  const finalistMap = buildScFinalistMap_(fin, cfg, exclusions, sourceModifiedAt);
  const approvalMap = buildScApprovalMap_(ss.getSheetByName('PopUp Request Approval'));
  const last = sub.getLastRow();
  if (last < 3) return {records:records, exclusions:exclusions, scannedRows:0};
  const rows = sub.getRange(3,1,last-2,27).getValues();
  rows.forEach(function(r, idx){
    const rowNumber = idx + 3;
    const dates = [asDate_(r[18]),asDate_(r[19]),asDate_(r[20])].filter(Boolean);
    const inYear = dates.filter(function(d){ return d.getFullYear()===cfg.year; });
    if (!inYear.length) return;
    const s = {
      cutoff:truth_(r[0]), businessLine:String(r[1]||'').trim(), campaignDepartment:String(r[2]||'').trim(), campaign:String(r[3]||'').trim(),
      title:String(r[4]||'').trim(), titleValidation:String(r[5]||'').trim(), content:String(r[6]||'').trim(), contentValidation:String(r[7]||'').trim(),
      requestor:String(r[8]||'').trim(), assetType:String(r[9]||'').trim(), timeSensitive:String(r[10]||'').trim(), sellerScope:String(r[11]||'').trim(),
      targetSellers:String(r[12]||'').trim(), destinationUrl:String(r[13]||'').trim(), artwork:String(r[14]||'').trim(), remarks:String(r[15]||'').trim(),
      compliance:truth_(r[16]), monetary:truth_(r[17]), preferredDates:dates, requestId:String(r[21]||'').trim(),
      internalBusinessUnit:String(r[22]||'').trim(), internalCampaignDepartment:String(r[23]||'').trim(), internalMessaging:String(r[24]||'').trim(),
      opsInternalGrade:String(r[25]||'').trim(), internalGrade:String(r[26]||'').trim()
    };
    const sourceRecordKey = 'SC|' + normLower_(s.requestId) + '|' + normLower_(s.assetType);
    const q = evaluateScQuality_(s, cfg);
    if (!q.include) {
      exclusions.push(makeExclusion_(PORTAL_SYNC_SOURCE_SC, sourceRecordKey || ('SCROW|'+rowNumber), 'SUBMISSION FORM!'+rowNumber, s.requestId, q.code, q.reason, PORTAL_SYNC_RULESET_SC, 3, s, sourceModifiedAt));
      return;
    }
    const finalist = finalistMap[sourceRecordKey] || null;
    const approvalEvidence = resolveScApprovalEvidence_(s, approvalMap);
    const assetApproval = evaluateScAssetApproval_(s, finalist, approvalEvidence);
    const readiness = evaluateScReadiness_(s, channelRules[s.assetType] || null, cfg);
    const st = evaluateScStatus_(s, finalist, readiness, cfg, assetApproval);
    const safeReq = sanitizeIdPart_(s.requestId) || shortHash_(sourceRecordKey,10).toUpperCase();
    const assetHash = shortHash_(normLower_(s.assetType),7).toUpperCase();
    const portalRequestId = 'SC-' + safeReq + '-' + assetHash;
    const portalCommsItemId = 'SCCI-' + shortHash_(sourceRecordKey,12).toUpperCase();
    const primaryDate = inYear[0];
    const explicitTime = timeSlotFromText_(s.remarks);
    const requestFields = {
      request_id:portalRequestId, legacy_slot:s.requestId, campaign_name:s.campaign, objective:s.internalMessaging || s.content, requester_email:s.requestor,
      team_id:'', department:department_(s.businessLine), priority:s.internalGrade || 'UNSCORED', status:st.status,
      business_impact:s.content, compliance_required:syncBoolText_(s.compliance), monetary_risk:syncBoolText_(s.monetary), launch_dependency:s.timeSensitive,
      start_date:dateIso_(primaryDate), end_date:dateIso_(primaryDate), seller_scope:s.sellerScope, seller_target:s.targetSellers, target_criteria:'', target_size:'',
      created_at:primaryDate, updated_at:'', closed_at:'', parent_request_id:'SC-'+safeReq, request_type:'NORMAL',
      cycle_id:cycleForDate_(primaryDate,'SC'), completeness_status:readiness.ready?'COMPLETE':'INCOMPLETE', editable_until:editableUntil_(primaryDate,'SC'), locked_at:'',
      revision_due_at:'', manager_approval_status:assetApproval.status, manager_approver_email:'', manager_approved_at:'', preferred_time_slot:explicitTime,
      time_source:explicitTime?'SOURCE_REMARK':'NOT_SPECIFIED', source_system:'GOOGLE_SHEETS_SC'
    };
    const commsFields = {
      comms_item_id:portalCommsItemId, request_id:portalRequestId, channel_group:'SC', module:'SC', asset_type:s.assetType, title:s.title, key_message:s.content,
      destination_url:s.destinationUrl, owner_email:finalist?finalist.pic:'', reviewer_email:'', approver_email:'', status:st.status,
      scheduled_at:finalist && finalist.scheduled ? (finalist.confirmedDate || dateIso_(primaryDate)) : '', published_at:'', artwork_url:s.artwork, current_version:1,
      created_at:primaryDate, updated_at:''
    };
    const sourceStatus = {
      sourceRow:rowNumber, sourceRequestId:s.requestId, assetType:s.assetType, businessLine:s.businessLine, campaignDepartment:s.campaignDepartment, team:s.campaignDepartment,
      cutoff:s.cutoff, titleValidation:s.titleValidation, contentValidation:s.contentValidation,
      timeSensitive:s.timeSensitive, sellerScope:s.sellerScope, targetSellers:s.targetSellers, artwork:s.artwork, remarks:s.remarks, compliance:s.compliance, monetary:s.monetary,
      preferredDates:s.preferredDates.map(dateIso_), opsInternalGrade:s.opsInternalGrade, internalGrade:s.internalGrade, readiness:readiness,
      finalist:finalist || null, allocationStatus:st.substatus, assetApproval:assetApproval
    };
    records.push(makeSyncRecord_(PORTAL_SYNC_SOURCE_SC, sourceRecordKey, 'SUBMISSION FORM!'+rowNumber, s.requestId, portalRequestId, portalCommsItemId, requestFields, commsFields, sourceStatus, st.status, st.substatus, PORTAL_SYNC_RULESET_SC, 3, sourceModifiedAt));
  });
  return {records:records, exclusions:exclusions, scannedRows:rows.length, finalistRows:Object.keys(finalistMap).length, approvalKeys:Object.keys(approvalMap).length};
}

function evaluateScQuality_(s, cfg) {
  if (!cfg.qualityEnabled) return {include:true};
  if (cfg.scRequireRequestId && !s.requestId) return {include:false,code:'MISSING_REQUEST_ID',reason:'Request ID is missing.'};
  if (cfg.scRequirePreferredDate && (!s.preferredDates || !s.preferredDates.some(function(d){ return d && d.getFullYear()===cfg.year; }))) return {include:false,code:'NO_VALID_PREFERRED_DATE',reason:'No valid preferred date in active sync year.'};
  if (cfg.scRequireIdentity && (!s.businessLine || !s.campaignDepartment || !s.campaign || !s.requestor || !s.assetType)) return {include:false,code:'MISSING_IDENTITY',reason:'Business Line / Department / Campaign / Requestor / Asset Type is incomplete.'};
  if (cfg.scRequirePayload && ![s.title,s.content,s.destinationUrl].some(nonBlank_)) return {include:false,code:'INSUFFICIENT_PAYLOAD',reason:'Title, Content and Destination Link are all blank.'};
  return {include:true};
}

function evaluateScReadiness_(s, channelRule, cfg) {
  const failures = [];
  if (cfg.scRequireTitlePass && !/^pass$/i.test(s.titleValidation)) failures.push('TITLE_VALIDATION');
  if (cfg.scRequireContentPass && !/^pass$/i.test(s.contentValidation)) failures.push('CONTENT_VALIDATION');
  if (cfg.scRequireDestination && !/^https?:\/\//i.test(s.destinationUrl)) failures.push('DESTINATION');
  if (/specific seller/i.test(s.sellerScope) && (!s.targetSellers || /^(pending|tbc|n\/a|na)$/i.test(s.targetSellers))) failures.push('TARGET_SELLERS');
  if (channelRule && normUpper_(channelRule.artwork_rule)==='REQUIRED' && !s.artwork) failures.push('ARTWORK');
  if (!s.preferredDates || !s.preferredDates.length) failures.push('PREFERRED_DATE');
  return {ready:failures.length===0, failures:failures};
}

function evaluateScStatus_(s, finalist, readiness, cfg, assetApproval) {
  const map = cfg.scStatusMap;
  if (finalist) {
    const fStatus = normUpper_(finalist.status), cate = normUpper_(finalist.cate);
    if (/CANCEL/.test(cate)) return {status:map.CANCEL||'CANCELLED',substatus:'FINALIST_CANCEL'};
    if (fStatus==='REJECT' || /FULL\s*SLOT/.test(cate)) return {status:(/FULL\s*SLOT/.test(cate)?map.FULL_SLOT:map.REJECT)||'REJECTED',substatus:/FULL\s*SLOT/.test(cate)?'FULL_SLOT':'FINALIST_REJECT'};
    if (/QC\s*PROCESS/.test(fStatus)) return {status:map.QC_PROCESS||'IN_REVIEW',substatus:'QC_PROCESS'};
    if (fStatus==='READY' && finalist.scheduled) return {status:map.READY_SCHEDULED||'SCHEDULED',substatus:'FINALIST_SCHEDULED'};
    if (fStatus==='READY') return {status:map.READY||'FINALIST',substatus:'ALLOCATED'};
    return {status:'IN_REVIEW',substatus:fStatus||'FINALIST_UNKNOWN'};
  }
  if (assetApproval && assetApproval.status==='REJECTED') return {status:map.REJECT||'REJECTED',substatus:'ASSET_MANAGER_REJECTED'};
  if (assetApproval && assetApproval.status==='PENDING_REVIEW' && readiness.ready) return {status:'IN_REVIEW',substatus:'ASSET_APPROVAL_PENDING'};
  if (!readiness.ready) return {status:map.INCOMPLETE||'INCOMPLETE',substatus:'READINESS_GATE'};
  if (s.cutoff) return {status:map.PENDING_ALLOCATION||'READY_FOR_CUTOFF',substatus:'PENDING_ALLOCATION'};
  return {status:map.WAITING_CUTOFF||'SUBMITTED',substatus:'WAITING_CUTOFF'};
}

function buildScFinalistMap_(fin, cfg, exclusions, sourceModifiedAt) {
  const map = {};
  const last = fin.getLastRow();
  if (last < 2) return map;
  const vals = fin.getRange(1,1,last,30).getValues();
  const headers = vals.shift().map(function(x){ return String(x||'').trim(); });
  const ix = {
    status:findHeaderIndex_(headers,['Status'],2), pic:findHeaderIndex_(headers,['PIC Setup'],3), campaignId:findHeaderIndex_(headers,['Campaign ID'],4), scheduled:findHeaderIndex_(headers,['Scheduled'],5),
    business:findHeaderIndex_(headers,['Business Line'],6), team:findHeaderIndex_(headers,['Campaign Department'],7), campaign:findHeaderIndex_(headers,['Campaign Name'],8),
    requestor:findHeaderIndex_(headers,['Requestor'],13), asset:findHeaderIndex_(headers,['Asset Type'],14), cate:findHeaderIndex_(headers,['cate','Category'],28)
  };
  const requestIdIndexes = headerIndexesMatching_(headers,/^Request ID/i); if (!requestIdIndexes.length) requestIdIndexes.push(26,27);
  const dateIndexes = headerIndexesMatching_(headers,/Preferred Date|^Date[123]$/i); if (dateIndexes.length < 1) dateIndexes.push(23,24,25);
  vals.forEach(function(r, idx){
    const reqId = firstNonBlankAt_(r, requestIdIndexes);
    const asset = String(r[ix.asset]||'').trim();
    if (!reqId || !asset) return;
    const key = 'SC|' + normLower_(reqId) + '|' + normLower_(asset);
    const dates = dateIndexes.map(function(i){ return asDate_(r[i]); }).filter(Boolean);
    const record = {
      finalistRow:idx+2, requestId:reqId, assetType:asset, status:String(r[ix.status]||'').trim(), pic:String(r[ix.pic]||'').trim(), campaignId:String(r[ix.campaignId]||'').trim(),
      scheduled:truth_(r[ix.scheduled]), businessLine:String(r[ix.business]||'').trim(), campaignDepartment:String(r[ix.team]||'').trim(), campaign:String(r[ix.campaign]||'').trim(),
      requestor:String(r[ix.requestor]||'').trim(), cate:String(r[ix.cate]||'').trim(), confirmedDate:dates.length?dateIso_(dates[0]):'', preferredDates:dates.map(dateIso_)
    };
    map[key] = record;
  });
  return map;
}


function scApprovalKey_(businessLine,campaignDepartment,campaign,requestor,assetType){
  return [normLower_(businessLine),normLower_(campaignDepartment),normalizeCampaignSyncKey_(campaign),normLower_(requestor),normLower_(assetType)].join('|');
}
function normalizeCampaignSyncKey_(name){return String(name||'').toLowerCase().replace(/\(\s*content\s*\d+\s*\)\s*$/i,'').replace(/\bcontent\s*\d+\s*$/i,'').replace(/[\s_\-–—]+/g,' ').replace(/[^a-z0-9ก-๙ .&/+]/gi,'').trim();}
function buildScApprovalMap_(sheet){
  const map={};if(!sheet||sheet.getLastRow()<2)return map;const vals=sheet.getDataRange().getValues(),headers=vals.shift().map(function(x){return String(x||'').trim();});
  const campaignIndexes=headerIndexesMatching_(headers,/^Campaign Name/i);
  const ix={business:findHeaderIndex_(headers,['Business Line'],-1),team:findHeaderIndex_(headers,['Campaign Department'],-1),campaign:campaignIndexes.length?campaignIndexes[0]:-1,requestor:findHeaderIndex_(headers,['Requestor'],-1),asset:findHeaderIndex_(headers,['Asset Type'],-1),manager:findHeaderIndex_(headers,['Manager Approve'],-1),comment:findHeaderIndex_(headers,['Comment'],-1),status:findHeaderIndex_(headers,['Status'],-1)};
  const dateIndexes=headerIndexesMatching_(headers,/Preferred Date/i);
  vals.forEach(function(r,idx){if(ix.campaign<0||ix.requestor<0||ix.asset<0)return;const campaign=String(r[ix.campaign]||'').trim(),requestor=String(r[ix.requestor]||'').trim(),asset=String(r[ix.asset]||'').trim();if(!campaign||!requestor||!asset)return;const key=scApprovalKey_(ix.business>=0?r[ix.business]:'',ix.team>=0?r[ix.team]:'',campaign,requestor,asset);const record={sourceRow:idx+2,businessLine:ix.business>=0?String(r[ix.business]||'').trim():'',campaignDepartment:ix.team>=0?String(r[ix.team]||'').trim():'',campaign:campaign,requestor:requestor,assetType:asset,managerApprove:ix.manager>=0?String(r[ix.manager]||'').trim():'',comment:ix.comment>=0?String(r[ix.comment]||'').trim():'',workflowStatus:ix.status>=0?String(r[ix.status]||'').trim():'',preferredDates:dateIndexes.map(function(i){return asDate_(r[i]);}).filter(Boolean).map(dateIso_)};if(!map[key])map[key]=[];map[key].push(record);});
  return map;
}
function resolveScApprovalEvidence_(s,map){
  const list=(map[scApprovalKey_(s.businessLine,s.campaignDepartment,s.campaign,s.requestor,s.assetType)]||[]).slice();if(!list.length)return null;const wanted=(s.preferredDates||[]).map(dateIso_);list.sort(function(a,b){const ah=(a.preferredDates||[]).some(function(d){return wanted.indexOf(d)>=0;})?1:0,bh=(b.preferredDates||[]).some(function(d){return wanted.indexOf(d)>=0;})?1:0;return bh-ah||Number(b.sourceRow||0)-Number(a.sourceRow||0);});return list[0];
}
function isScPopupAsset_(asset){return /pop[ -]?up|popup/i.test(String(asset||''));}
function evaluateScAssetApproval_(s,finalist,evidence){
  const manager=normUpper_(evidence&&evidence.managerApprove),workflow=normUpper_(evidence&&evidence.workflowStatus),fStatus=normUpper_(finalist&&finalist.status),fCate=normUpper_(finalist&&finalist.cate);const explicitReject=/^(NO|N|REJECT|REJECTED|NOT APPROVED|FALSE)$/.test(manager)||/REJECT/.test(workflow),explicitApprove=/^(YES|Y|APPROVE|APPROVED|TRUE)$/.test(manager);const allocated=!!finalist&&(truth_(finalist.scheduled)||fStatus==='READY')&&!/REJECT|CANCEL|FULL\s*SLOT/.test(fStatus+' '+fCate);const allocationReject=!!finalist&&/REJECT|CANCEL|FULL\s*SLOT/.test(fStatus+' '+fCate);let status='NOT_REQUIRED',conflict=false;if(allocated){status='APPROVED_BY_ALLOCATION';conflict=explicitReject;}else if(allocationReject){status='REJECTED_BY_ALLOCATION';conflict=explicitApprove;}else if(explicitReject)status='REJECTED';else if(explicitApprove)status='APPROVED';else if(isScPopupAsset_(s.assetType))status='PENDING_REVIEW';return {status:status,managerApprove:evidence?evidence.managerApprove:'',comment:evidence?evidence.comment:'',workflowStatus:evidence?evidence.workflowStatus:'',sourceRow:evidence?evidence.sourceRow:'',evidenceMatched:!!evidence,conflict:conflict,policy:'VALIDATION_IS_NOT_APPROVAL; FINALIST_ALLOCATION_IS_FINAL_OPERATIONAL_EVIDENCE'};
}

function parseSocialSource_(cfg,sourceModifiedAt){
  const ss=SpreadsheetApp.openById(PORTAL_SOCIAL_SPREADSHEET_ID),sh=ss.getSheetByName('Channel Schedule 2026'),records=[],exclusions=[];if(!sh||sh.getLastRow()<2)return {records:records,exclusions:exclusions,scannedRows:0};const vals=sh.getDataRange().getValues(),headers=vals.shift().map(function(x){return String(x||'').trim();});
  const ix={id:findHeaderIndex_(headers,['ID'],-1),requester:findHeaderIndex_(headers,['Requester'],-1),team:findHeaderIndex_(headers,['Team'],-1),topic:findHeaderIndex_(headers,['Topic'],-1),channel:findHeaderIndex_(headers,['Channel'],-1),objective:findHeaderIndex_(headers,['Objective'],-1),subject:findHeaderIndex_(headers,['Subject'],-1),type:findHeaderIndex_(headers,['Type'],-1),live:findHeaderIndex_(headers,['Live date'],-1),time:findHeaderIndex_(headers,['Time'],-1),status:findHeaderIndex_(headers,['STATUS','Status'],-1),mainGroup:findHeaderIndex_(headers,['Main Group'],-1),description:findHeaderIndex_(headers,['FULL DESCRIPTION'],-1),comments:findHeaderIndex_(headers,['Comments'],-1),brief:findHeaderIndex_(headers,['Brief'],-1),landing:findHeaderIndex_(headers,['Landing URL'],-1),finalLink:findHeaderIndex_(headers,['Final Link (FB)'],-1),artwork:findHeaderIndex_(headers,['AW / VDO Link'],-1),pic:findHeaderIndex_(headers,['PIC'],-1),scheduleBy:findHeaderIndex_(headers,['Schedule by'],-1),gdPic:findHeaderIndex_(headers,['GD PIC'],-1),awStatus:findHeaderIndex_(headers,['AW Status'],-1),ai1:findHeaderIndex_(headers,['AI Check 1 Seatalk Status'],-1),ai2:findHeaderIndex_(headers,['AI Check 2 Seatalk Status'],-1),weekNo:findHeaderIndex_(headers,['Week No'],-1)};
  vals.forEach(function(r,idx){const rowNumber=idx+2,liveDate=ix.live>=0?asDate_(r[ix.live]):null;if(!liveDate||liveDate.getFullYear()!==cfg.year)return;const channelRaw=ix.channel>=0?String(r[ix.channel]||'').trim():'',socialChannels=socialChannelsFromText_(channelRaw);if(!socialChannels.length)return;const topic=ix.topic>=0?String(r[ix.topic]||'').trim():'',requester=ix.requester>=0?String(r[ix.requester]||'').trim():'',id=ix.id>=0?String(r[ix.id]||'').trim():'';if(!topic||!requester){exclusions.push(makeExclusion_(PORTAL_SYNC_SOURCE_SOCIAL,'SOCROW|'+rowNumber,'Channel Schedule 2026!'+rowNumber,id,'MISSING_IDENTITY','Social row requires Topic and Requester.',PORTAL_SYNC_RULESET_SOCIAL,1,{topic:topic,requester:requester,channel:channelRaw},sourceModifiedAt));return;}const type=ix.type>=0?String(r[ix.type]||'').trim():'',originalStatus=ix.status>=0?String(r[ix.status]||'').trim():'',st=evaluateSocialStatus_(originalStatus,cfg),naturalKey=[id||rowNumber,normLower_(topic),dateIso_(liveDate),socialChannels.join('|')].join('|'),sourceRecordKey='SOC|'+shortHash_(naturalKey,24),safeId=sanitizeIdPart_(id)||shortHash_(naturalKey,10).toUpperCase(),portalRequestId='SOC-'+safeId,portalCommsItemId='SOCCI-'+shortHash_(naturalKey,12).toUpperCase(),explicitTime=ix.time>=0?timeSlotFromText_(r[ix.time]):'';const landing=ix.landing>=0?String(r[ix.landing]||'').trim():'',finalLink=ix.finalLink>=0?String(r[ix.finalLink]||'').trim():'',artwork=ix.artwork>=0?String(r[ix.artwork]||'').trim():'';const sourceStatus={sourceRow:rowNumber,sourceTeam:ix.team>=0?String(r[ix.team]||'').trim():'',team:ix.team>=0?String(r[ix.team]||'').trim():'',topic:topic,channel:channelRaw,socialChannels:socialChannels,objective:ix.objective>=0?String(r[ix.objective]||'').trim():'',subject:ix.subject>=0?String(r[ix.subject]||'').trim():'',type:type,originalStatus:originalStatus,mainGroup:ix.mainGroup>=0?String(r[ix.mainGroup]||'').trim():'',fullDescription:ix.description>=0?String(r[ix.description]||'').trim():'',comments:ix.comments>=0?String(r[ix.comments]||'').trim():'',brief:ix.brief>=0?String(r[ix.brief]||'').trim():'',landingUrl:landing,finalLink:finalLink,artwork:artwork,pic:ix.pic>=0?String(r[ix.pic]||'').trim():'',scheduleBy:ix.scheduleBy>=0?String(r[ix.scheduleBy]||'').trim():'',gdPic:ix.gdPic>=0?String(r[ix.gdPic]||'').trim():'',awStatus:ix.awStatus>=0?String(r[ix.awStatus]||'').trim():'',aiCheck1Status:ix.ai1>=0?String(r[ix.ai1]||'').trim():'',aiCheck2Status:ix.ai2>=0?String(r[ix.ai2]||'').trim():'',weekNo:ix.weekNo>=0?String(r[ix.weekNo]||'').trim():''};const assetLabel=socialChannels.join(' + ')+' · '+(type||'Content');const requestFields={request_id:portalRequestId,legacy_slot:id,campaign_name:topic,objective:sourceStatus.objective||sourceStatus.subject,requester_email:requester,team_id:'',department:'Other Entities',priority:'UNSCORED',status:st.status,business_impact:sourceStatus.fullDescription||sourceStatus.subject,compliance_required:'FALSE',monetary_risk:'FALSE',launch_dependency:'',start_date:dateIso_(liveDate),end_date:dateIso_(liveDate),seller_scope:'',seller_target:'',target_criteria:'',target_size:'',created_at:liveDate,updated_at:'',closed_at:'',parent_request_id:'',request_type:'NORMAL',cycle_id:cycleForDate_(liveDate,'SOCIAL'),completeness_status:'COMPLETE',editable_until:'',locked_at:'',revision_due_at:'',manager_approval_status:'NOT_REQUIRED',manager_approver_email:'',manager_approved_at:'',preferred_time_slot:explicitTime,time_source:explicitTime?'SOURCE_EXPLICIT':'NOT_SPECIFIED',source_system:'GOOGLE_SHEETS_SOCIAL'};const commsFields={comms_item_id:portalCommsItemId,request_id:portalRequestId,channel_group:'SOCIAL_MEDIA',module:'Social Media',asset_type:assetLabel,title:sourceStatus.subject||topic,key_message:sourceStatus.fullDescription||sourceStatus.comments,destination_url:finalLink||landing,owner_email:sourceStatus.pic,reviewer_email:'',approver_email:'',status:st.status,scheduled_at:dateIso_(liveDate),published_at:st.status==='PUBLISHED'?dateIso_(liveDate):'',artwork_url:artwork,current_version:1,created_at:liveDate,updated_at:''};records.push(makeSyncRecord_(PORTAL_SYNC_SOURCE_SOCIAL,sourceRecordKey,'Channel Schedule 2026!'+rowNumber,id,portalRequestId,portalCommsItemId,requestFields,commsFields,sourceStatus,st.status,st.substatus,PORTAL_SYNC_RULESET_SOCIAL,1,sourceModifiedAt));});return {records:records,exclusions:exclusions,scannedRows:vals.length};
}
function socialChannelsFromText_(value){const raw=String(value||'').toUpperCase(),out=[];const add=function(v){if(out.indexOf(v)<0)out.push(v);};if(/\bFB\b|FACEBOOK(?!\s*GROUP)/.test(raw))add('Facebook');if(/\bGROUP\b|FACEBOOK\s*GROUP/.test(raw))add('Facebook Group');if(/\bYT\b|YOUTUBE/.test(raw))add('YouTube');if(/\bTT\b|TIKTOK|TIK TOK/.test(raw))add('TikTok');if(/\bIG\b|INSTAGRAM/.test(raw))add('Instagram');if(/\bLINE\b/.test(raw))add('LINE');if((/SOCIAL\s*MEDIA|\bSM\b/.test(raw))&&!out.length)add('Social Media');return out;}
function evaluateSocialStatus_(value,cfg){const x=normUpper_(value),map=cfg.socialStatusMap||{};if(/CANCEL/.test(x))return {status:map.CANCELLED||'CANCELLED',substatus:'SOCIAL_CANCELLED'};if(x==='PUBLISHED')return {status:map.PUBLISHED||'PUBLISHED',substatus:'SOCIAL_PUBLISHED'};if(x==='DONE')return {status:map.DONE||'COMPLETED',substatus:'SOCIAL_DONE'};if(x==='SCHEDULED')return {status:map.SCHEDULED||'SCHEDULED',substatus:'SOCIAL_SCHEDULED'};if(x==='READY')return {status:map.READY||'READY_FOR_REVIEW',substatus:'SOCIAL_READY'};if(/POSTPONED|HOLD|WAITING/.test(x))return {status:map.HOLD||'SUBMITTED',substatus:'SOCIAL_HOLD'};if(/WORKING|IN\s*PROGRESS|BRIEFED/.test(x))return {status:map.WORKING||'IN_PRODUCTION',substatus:'SOCIAL_WORKING'};if(/TENTATIVE|PENDING|PLANNED|REC/.test(x))return {status:map.PENDING||'SUBMITTED',substatus:'SOCIAL_PLANNED'};return {status:map.DEFAULT||'SUBMITTED',substatus:x||'SOCIAL_SOURCE'};}

function reconcileSource_(db, sourceId, ruleSetId, ruleVersion, parsed, sourceModifiedAt, options) {
  const started = new Date();
  const runId = 'SYNC-' + Utilities.formatDate(started,'Asia/Bangkok','yyyyMMdd-HHmmss') + '-' + sourceId.replace('SRC-','') + '-' + Utilities.getUuid().slice(0,5).toUpperCase();
  const requestTable = loadTable_(db,'Requests');
  const itemTable = loadTable_(db,'Comms_Items');
  const stateTable = loadTable_(db,'Sync_Record_State');
  const exclusionTable = loadTable_(db,'Sync_Exclusions');
  const teamTable = loadTable_(db,'Teams');
  const requestMap = objectMapBy_(requestTable.objects,'request_id');
  const itemMap = objectMapBy_(itemTable.objects,'comms_item_id');
  const stateByKey = {}, stateByRow = {};
  stateTable.objects.forEach(function(s){
    if (String(s.source_id) !== sourceId) return;
    if (s.source_record_key) stateByKey[String(s.source_record_key)] = s;
    if (s.source_row_locator) stateByRow[String(s.source_row_locator)] = s;
  });
  const teamIds = ensureTeamIdsForSync_(teamTable, parsed.records);
  const seenStateIds = {}, seenRequestIds = {}, seenItemIds = {};
  const newEvents = [];
  let created=0, updated=0, unchanged=0, excluded=0;

  parsed.records.forEach(function(rec){
    let oldState = stateByKey[rec.sourceRecordKey] || stateByRow[rec.sourceRowLocator] || null;
    if (oldState) {
      rec.portalRequestId = String(oldState.portal_request_id || rec.portalRequestId);
      rec.portalCommsItemId = String(oldState.portal_comms_item_id || rec.portalCommsItemId);
      rec.requestFields.request_id = rec.portalRequestId;
      rec.commsFields.request_id = rec.portalRequestId;
      rec.commsFields.comms_item_id = rec.portalCommsItemId;
    }
    const teamKey = department_(rec.requestFields.department) + '|' + String(rec._sourceTeam||sourceTeamFromRecord_(rec)||'').trim().toLowerCase();
    if (teamIds[teamKey]) rec.requestFields.team_id = teamIds[teamKey];
    else {
      const sourceStatus = rec.sourceStatus || {};
      const rawTeam = sourceStatus.team || sourceStatus.campaignDepartment || sourceStatus.sourceTeam || '';
      const k = department_(rec.requestFields.department)+'|'+String(rawTeam).trim().toLowerCase();
      if (teamIds[k]) rec.requestFields.team_id = teamIds[k];
    }
    const existingReq = requestMap[rec.portalRequestId] || {};
    const existingItem = itemMap[rec.portalCommsItemId] || {};
    const existed = !!requestMap[rec.portalRequestId];
    seenRequestIds[rec.portalRequestId]=true; seenItemIds[rec.portalCommsItemId]=true;
    const now = new Date();
    const changed = !oldState || String(oldState.payload_hash||'') !== rec.payloadHash || String(oldState.canonical_status||'') !== rec.status || String(oldState.canonical_substatus||'') !== rec.substatus;
    const oldStatus = oldState ? String(oldState.canonical_status||'') : '';

    const reqFields = Object.assign({}, rec.requestFields);
    reqFields.updated_at = changed ? now : (existingReq.updated_at || reqFields.created_at || now);
    reqFields.closed_at = isTerminalStatus_(rec.status) ? (existingReq.closed_at || now) : '';
    const itemFields = Object.assign({}, rec.commsFields);
    itemFields.updated_at = changed ? now : (existingItem.updated_at || itemFields.created_at || now);
    requestMap[rec.portalRequestId] = mergeObject_(existingReq, reqFields);
    itemMap[rec.portalCommsItemId] = mergeObject_(existingItem, itemFields);

    if (!oldState) { oldState={state_id:'STATE-'+Utilities.getUuid()}; stateTable.objects.push(oldState); created++; }
    else if (changed) updated++; else unchanged++;
    Object.assign(oldState, {
      source_id:sourceId, source_record_key:rec.sourceRecordKey, source_row_locator:rec.sourceRowLocator, source_request_id:rec.sourceRequestId,
      portal_request_id:rec.portalRequestId, portal_comms_item_id:rec.portalCommsItemId, payload_hash:rec.payloadHash,
      source_status_json:JSON.stringify(rec.sourceStatus||{}), canonical_status:rec.status, canonical_substatus:rec.substatus,
      first_seen_at:oldState.first_seen_at||now, last_seen_at:now, source_modified_at:sourceModifiedAt, last_changed_at:changed?now:(oldState.last_changed_at||now),
      missing_from_source:'FALSE', rule_set_id:ruleSetId, rule_version:ruleVersion, last_sync_run_id:runId, notes:''
    });
    seenStateIds[oldState.state_id]=true;
    deactivateMatchingExclusion_(exclusionTable.objects, sourceId, rec.sourceRecordKey, rec.sourceRowLocator, now);
    if (changed) newEvents.push(syncEvent_(rec, oldStatus, rec.status, runId, rec.sourceStatus));
  });

  parsed.exclusions.forEach(function(ex){
    excluded++;
    upsertExclusionObject_(exclusionTable.objects, ex);
    const oldState = stateByKey[ex.source_record_key] || stateByRow[ex.source_row_locator] || null;
    if (oldState && oldState.portal_request_id) {
      const req = requestMap[String(oldState.portal_request_id)];
      if (req && /^GOOGLE_SHEETS_/.test(String(req.source_system||''))) { req.status='SOURCE_EXCLUDED'; req.updated_at=new Date(); }
      const item = itemMap[String(oldState.portal_comms_item_id||'')]; if (item) { item.status='SOURCE_EXCLUDED'; item.updated_at=new Date(); }
      oldState.missing_from_source='TRUE'; oldState.canonical_status='SOURCE_EXCLUDED'; oldState.canonical_substatus=ex.exclusion_code; oldState.last_seen_at=new Date(); oldState.last_sync_run_id=runId; oldState.notes='Excluded by Quality Gate V3';
      seenStateIds[oldState.state_id]=true;
    }
  });

  let missing=0;
  stateTable.objects.forEach(function(s){
    if (String(s.source_id)!==sourceId || seenStateIds[s.state_id]) return;
    if (!s.portal_request_id) return;
    missing++;
    s.missing_from_source='TRUE'; s.canonical_status='SOURCE_MISSING'; s.canonical_substatus='NOT_IN_CURRENT_SOURCE_SCOPE'; s.last_sync_run_id=runId; s.notes='Source row missing or moved outside active sync scope.';
    const req=requestMap[String(s.portal_request_id)]; if(req&&/^GOOGLE_SHEETS_/.test(String(req.source_system||''))){req.status='SOURCE_MISSING';req.updated_at=new Date();}
    const item=itemMap[String(s.portal_comms_item_id||'')]; if(item){item.status='SOURCE_MISSING';item.updated_at=new Date();}
  });

  requestTable.objects = Object.keys(requestMap).map(function(k){return requestMap[k];});
  itemTable.objects = Object.keys(itemMap).map(function(k){return itemMap[k];});
  writeTableObjects_(requestTable);
  writeTableObjects_(itemTable);
  writeTableObjects_(teamTable);
  writeTableObjects_(stateTable);
  writeTableObjects_(exclusionTable);
  appendObjects_(db.getSheetByName('Ticket_Events'), newEvents);

  const finished = new Date();
  appendObject_(db.getSheetByName('Sync_Runs'), {
    sync_run_id:runId, source_id:sourceId, run_mode:options.force?'FORCE':'INCREMENTAL', window_start:'', window_end:'', source_modified_at:sourceModifiedAt,
    started_at:started, finished_at:finished, scanned_rows:parsed.scannedRows||0, created_records:created, updated_records:updated, unchanged_records:unchanged,
    missing_records:missing, error_records:0, status:'SUCCESS', duration_ms:finished.getTime()-started.getTime(), triggered_by:options.triggeredBy||'MANUAL', error_summary:''
  });
  upsertCheckpoint_(db, sourceId, sourceModifiedAt, parsed.scannedRows||0, runId, finished, 'SUCCESS', 'Live Sync '+PORTAL_LIVE_SYNC_VERSION);
  return {sourceId:sourceId,runId:runId,scanned:parsed.scannedRows||0,active:parsed.records.length,excluded:excluded,created:created,updated:updated,unchanged:unchanged,missing:missing,durationMs:finished.getTime()-started.getTime()};
}

function sourceTeamFromRecord_(rec) {
  const s=rec.sourceStatus||{};
  return s.team || s.campaignDepartment || s.sourceTeam || '';
}

function ensureTeamIdsForSync_(teamTable, records) {
  const map={};
  teamTable.objects.forEach(function(t){ map[department_(t.department)+'|'+normLower_(t.team_name)] = t.team_id; });
  const now=new Date();
  records.forEach(function(rec){
    const s=rec.sourceStatus||{};
    const team=String(s.team||s.campaignDepartment||s.sourceTeam||'').trim();
    const dept=department_(rec.requestFields.department);
    if(!team)return;
    const key=dept+'|'+normLower_(team); if(map[key])return;
    const id='TEAM-'+shortHash_(key,10).toUpperCase();
    teamTable.objects.push({team_id:id,department:dept,team_name:team,status:'ACTIVE',manager_email:'',created_at:now,updated_at:now,approval_owner_email:'',pillar_lead_email:'',sort_order:''});
    map[key]=id;
  });
  return map;
}

function makeSyncRecord_(sourceId, key, locator, sourceRequestId, portalRequestId, portalCommsItemId, requestFields, commsFields, sourceStatus, status, substatus, ruleSetId, ruleVersion, sourceModifiedAt) {
  if (sourceId===PORTAL_SYNC_SOURCE_PN || sourceId===PORTAL_SYNC_SOURCE_SOCIAL) sourceStatus.sourceTeam = String(sourceStatus.team || sourceStatus.sourceTeam || '');
  return {
    sourceId:sourceId, sourceRecordKey:key, sourceRowLocator:locator, sourceRequestId:sourceRequestId||'', portalRequestId:portalRequestId, portalCommsItemId:portalCommsItemId,
    requestFields:requestFields, commsFields:commsFields, sourceStatus:sourceStatus, status:status, substatus:substatus, ruleSetId:ruleSetId, ruleVersion:ruleVersion,
    payloadHash:hashObject_(stableSyncPayload_(key, requestFields, commsFields, sourceStatus, status, substatus)), sourceModifiedAt:sourceModifiedAt
  };
}

function makeExclusion_(sourceId,key,locator,sourceRequestId,code,reason,ruleSetId,ruleVersion,payload,sourceModifiedAt) {
  const now=new Date();
  return {exclusion_id:'EXC-'+shortHash_(sourceId+'|'+locator,18).toUpperCase(),source_id:sourceId,source_record_key:key||'',source_row_locator:locator||'',source_request_id:sourceRequestId||'',exclusion_code:code,exclusion_reason:reason,rule_set_id:ruleSetId,rule_version:ruleVersion,first_seen_at:now,last_seen_at:now,active:'TRUE',payload_hash:hashObject_(payload),metadata_json:JSON.stringify({sourceModifiedAt:sourceModifiedAt?sourceModifiedAt.toISOString():'',payload:payload})};
}

function syncEvent_(rec, oldStatus, newStatus, runId, sourceStatus) {
  const eventType=!oldStatus?'SOURCE_SYNCED':(oldStatus!==newStatus?'SOURCE_STATUS_CHANGED':'SOURCE_DATA_CHANGED');
  return {event_id:'EVT-'+Utilities.getUuid(),request_id:rec.portalRequestId,comms_item_id:rec.portalCommsItemId,event_at:new Date(),actor_email:'sync-engine@system',actor_role:'SYSTEM',event_type:eventType,field_name:oldStatus!==newStatus?'status':'source_payload',old_value:oldStatus||'',new_value:newStatus,comment:'Updated from read-only source tracker.',metadata_json:JSON.stringify({syncRunId:runId,sourceId:rec.sourceId,sourceRecordKey:rec.sourceRecordKey,substatus:rec.substatus,sourceStatus:sourceStatus})};
}

function scChannelRuleMap_(db) {
  const out={};
  tableObjectsRaw_(db,'Channel_Rules').forEach(function(r){ if(normUpper_(r.module)==='SC' && String(r.active).toUpperCase()!=='FALSE' && r.subtype_or_asset) out[String(r.subtype_or_asset).trim()]=r; });
  return out;
}

function upsertCheckpoint_(db, sourceId, modifiedAt, rowCount, runId, now, status, notes) {
  const table=loadTable_(db,'Sync_Checkpoints');
  let row=table.objects.find(function(x){return String(x.source_id)===sourceId;});
  if(!row){row={checkpoint_id:'CP-'+sourceId};table.objects.push(row);}
  Object.assign(row,{source_id:sourceId,last_source_modified_at:modifiedAt,last_successful_sync_at:status==='SUCCESS'?now:(row.last_successful_sync_at||''),last_attempt_at:now,last_row_count:rowCount,last_payload_hash:'',last_sync_run_id:runId,consecutive_errors:status==='SUCCESS'?0:Number(row.consecutive_errors||0)+1,next_retry_at:'',status:status,updated_at:now,updated_by:'sync-engine',notes:notes||''});
  writeTableObjects_(table);
}

function sourceModifiedAfterCheckpoint_(checkpoints, sourceId, modifiedAt) {
  const cp=(checkpoints||[]).find(function(x){return String(x.source_id)===sourceId;});
  if(!cp || !cp.last_source_modified_at || String(cp.status||'').toUpperCase()!=='SUCCESS')return true;
  const last=asDate_(cp.last_source_modified_at); if(!last)return true;
  return modifiedAt.getTime()>last.getTime()+1000;
}

function upsertExclusionObject_(objects, ex) {
  let row=objects.find(function(x){return String(x.exclusion_id)===String(ex.exclusion_id);});
  if(!row){objects.push(ex);return;}
  row.last_seen_at=new Date();row.active='TRUE';row.exclusion_code=ex.exclusion_code;row.exclusion_reason=ex.exclusion_reason;row.payload_hash=ex.payload_hash;row.metadata_json=ex.metadata_json;
}

function deactivateMatchingExclusion_(objects, sourceId, key, locator, now) {
  objects.forEach(function(x){if(String(x.source_id)===sourceId && (String(x.source_record_key)===key || String(x.source_row_locator)===locator) && String(x.active).toUpperCase()!=='FALSE'){x.active='FALSE';x.last_seen_at=now;}});
}

function upsertConfigValue_(key,value,description,updatedBy) {
  const ss=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),sh=ss.getSheetByName('Config');
  const vals=sh.getDataRange().getValues(),headers=vals[0].map(String),keyCol=headers.indexOf('key');
  for(let i=1;i<vals.length;i++){
    if(String(vals[i][keyCol])===key){
      const updates={value:value,description:description||vals[i][headers.indexOf('description')],updated_at:new Date(),updated_by:updatedBy||'sync-engine'};
      Object.keys(updates).forEach(function(h){const c=headers.indexOf(h);if(c>=0)sh.getRange(i+1,c+1).setValue(updates[h]);});return;
    }
  }
  const obj={key:key,value:value,description:description||'',updated_at:new Date(),updated_by:updatedBy||'sync-engine'};
  sh.appendRow(headers.map(function(h){return Object.prototype.hasOwnProperty.call(obj,h)?obj[h]:'';}));
}

function loadTable_(ss,name) {
  const sheet=ss.getSheetByName(name); if(!sheet)throw new Error('DB sheet not found: '+name);
  const lastRow=sheet.getLastRow(),lastCol=sheet.getLastColumn();
  const values=lastRow?sheet.getRange(1,1,lastRow,lastCol).getValues():[];
  const headers=values.length?values.shift().map(function(x){return String(x||'');}):[];
  const objects=values.filter(function(r){return r.some(function(v){return v!=='';});}).map(function(r){const o={};headers.forEach(function(h,i){if(h)o[h]=r[i];});return o;});
  return {sheet:sheet,headers:headers,objects:objects};
}

function tableObjectsRaw_(ss,name){return loadTable_(ss,name).objects;}

function writeTableObjects_(table) {
  const sh=table.sheet,headers=table.headers,objects=table.objects||[];
  ensureSheetSize_(sh,Math.max(2,objects.length+1),headers.length);
  const clearRows=Math.max(0,sh.getLastRow()-1); if(clearRows)sh.getRange(2,1,clearRows,headers.length).clearContent();
  if(!objects.length)return;
  const rows=objects.map(function(o){return headers.map(function(h){return Object.prototype.hasOwnProperty.call(o,h)?o[h]:'';});});
  sh.getRange(2,1,rows.length,headers.length).setValues(rows);
}

function appendObject_(sheet,obj){appendObjects_(sheet,[obj]);}
function appendObjects_(sheet,objects){
  if(!objects||!objects.length)return;
  const headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(String);
  ensureSheetSize_(sheet,sheet.getLastRow()+objects.length+1,headers.length);
  const rows=objects.map(function(o){return headers.map(function(h){return Object.prototype.hasOwnProperty.call(o,h)?o[h]:'';});});
  sheet.getRange(sheet.getLastRow()+1,1,rows.length,headers.length).setValues(rows);
}
function ensureSheetSize_(sh,rows,cols){if(sh.getMaxRows()<rows)sh.insertRowsAfter(sh.getMaxRows(),rows-sh.getMaxRows());if(sh.getMaxColumns()<cols)sh.insertColumnsAfter(sh.getMaxColumns(),cols-sh.getMaxColumns());}
function objectMapBy_(objects,key){const m={};(objects||[]).forEach(function(o){if(o[key]!==''&&o[key]!==undefined)m[String(o[key])]=o;});return m;}
function mergeObject_(base,fields){Object.keys(fields||{}).forEach(function(k){base[k]=fields[k];});return base;}

function findHeaderIndex_(headers,names,fallback){for(let n=0;n<names.length;n++){const target=normLower_(names[n]);for(let i=0;i<headers.length;i++)if(normLower_(headers[i])===target)return i;}return fallback;}
function headerIndexesMatching_(headers,re){const out=[];headers.forEach(function(h,i){if(re.test(String(h||'').trim()))out.push(i);});return out;}
function firstNonBlankAt_(row,indexes){for(let i=0;i<indexes.length;i++){const v=String(row[indexes[i]]||'').trim();if(v)return v;}return'';}
function nonBlank_(v){return String(v===undefined||v===null?'':v).trim()!=='';}
function normUpper_(v){return String(v||'').trim().toUpperCase();}
function normLower_(v){return String(v||'').trim().toLowerCase();}
function parseJsonSafe_(v,fallback){if(!v)return fallback;try{return typeof v==='object'?v:JSON.parse(String(v));}catch(err){return fallback;}}
function sanitizeIdPart_(v){return String(v||'').trim().replace(/[^A-Za-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,40);}
function isTerminalStatus_(s){return ['CANCELLED','REJECTED','CLOSED'].indexOf(normUpper_(s))>=0;}
function formatDateTime_(d){return Utilities.formatDate(d,'Asia/Bangkok','yyyy-MM-dd HH:mm:ss');}
function syncBoolText_(v){return v===true||/^(true|yes|y|1)$/i.test(String(v||'').trim())?'TRUE':'FALSE';}
function stableSyncPayload_(key,requestFields,commsFields,sourceStatus,status,substatus){
  const req=Object.assign({},requestFields||{}),item=Object.assign({},commsFields||{}),state=JSON.parse(JSON.stringify(sourceStatus||{}));
  ['created_at','updated_at','closed_at'].forEach(function(k){delete req[k];});
  ['created_at','updated_at'].forEach(function(k){delete item[k];});
  delete state.sourceRow; if(state.finalist)delete state.finalist.finalistRow;
  return {key:key,request:req,item:item,state:state,status:status,substatus:substatus};
}
function hashObject_(obj){return shortHash_(stableStringify_(obj),32);}
function stableStringify_(obj){if(obj===null||typeof obj!=='object')return JSON.stringify(obj);if(Array.isArray(obj))return '['+obj.map(stableStringify_).join(',')+']';return '{'+Object.keys(obj).sort().map(function(k){return JSON.stringify(k)+':'+stableStringify_(obj[k]);}).join(',')+'}';}
function shortHash_(text,len){const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text||''),Utilities.Charset.UTF_8);let hex='';bytes.forEach(function(b){const v=(b+256)%256;hex+=('0'+v.toString(16)).slice(-2);});return hex.slice(0,len||16);}
