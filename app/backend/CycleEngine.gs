/** Seller Communication Portal v3.7 cycle engine.
 * Installable time trigger should call runCycleEngine every 15 minutes.
 * Production writes happen only in the Portal DB; source trackers remain read-only.
 */
function runCycleEngine(){
  const now=new Date(),cycles=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Communication_Cycles');
  cycles.filter(c=>c.status==='OPEN').forEach(c=>{processCycleReminders_(c,now);const cutoff=new Date(String(c.cutoff_at).replace(' ','T')+'+07:00');if(!isNaN(cutoff)&&now>=cutoff)closeCycle_(c,now);});
}
function processCycleReminders_(cycle,now){
  const rules=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Notification_Rules').filter(r=>r.active!=='FALSE'&&r.event_type==='REQUEST_INCOMPLETE_REMINDER'&&(r.channel_group===cycle.channel_group||r.channel_group==='ALL'));
  const cutoff=new Date(String(cycle.cutoff_at).replace(' ','T')+'+07:00');if(isNaN(cutoff))return;
  rules.forEach(rule=>{const target=new Date(cutoff.getTime()+Number(rule.offset_minutes||0)*60000);if(Math.abs(now-target)>15*60000)return;queueSourceReminderCandidates_(cycle,rule,now);});
}
function queueSourceReminderCandidates_(cycle,rule,now){
  // Requests are read from the approved source trackers so the source remains the live requester entry point during migration.
  const source=getPortalData_().requests.filter(r=>r.cycleId===cycle.cycle_id&&r.completenessStatus==='INCOMPLETE'&&r.requestor);
  source.forEach(r=>sendNotificationOnce_(rule,r,cycle,now));
}
function sendNotificationOnce_(rule,r,cycle,now){
  const log=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID).getSheetByName('Notification_Log'),dedupe=[rule.notification_rule_id,r.id,cycle.cycle_id].join('|');
  const existing=log.getLastRow()>1?log.getRange(2,11,log.getLastRow()-1,1).getDisplayValues().flat():[];if(existing.indexOf(dedupe)>=0)return;
  const cutoff=cycle.cutoff_at,subject=renderTpl_(rule.subject_template,{cutoff_at:cutoff,request_id:r.id,campaign:r.campaign}),body=renderTpl_(rule.body_template,{cutoff_at:cutoff,request_id:r.id,campaign:r.campaign});let status='PORTAL_ONLY',err='';
  if(String(rule.email_enabled).toUpperCase()!=='FALSE'&&/^[^\s@]+@(shopee\.com|shopeemobile-external\.com)$/i.test(r.requestor)){try{MailApp.sendEmail({to:r.requestor,subject:subject,htmlBody:'<p>'+escapeHtml_(body)+'</p><p><strong>Request:</strong> '+escapeHtml_(r.campaign)+'</p>'});status='SENT'}catch(e){status='ERROR';err=String(e.message||e)}}
  log.appendRow(['NTF-'+Utilities.getUuid(),rule.event_type,r.id,cycle.cycle_id,r.requestor,status==='PORTAL_ONLY'?'PORTAL':'EMAIL+PORTAL',status,'',status==='SENT'?now:'',err,dedupe,now]);
}
function closeCycle_(cycle,now){
  const sh=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID).getSheetByName('Communication_Cycles'),values=sh.getDataRange().getValues(),headers=values[0],idCol=headers.indexOf('cycle_id'),statusCol=headers.indexOf('status'),lockCol=headers.indexOf('locked_at'),updCol=headers.indexOf('updated_at');
  for(let i=1;i<values.length;i++){if(String(values[i][idCol])!==String(cycle.cycle_id))continue;sh.getRange(i+1,statusCol+1).setValue('LOCKED');sh.getRange(i+1,lockCol+1).setValue(now);sh.getRange(i+1,updCol+1).setValue(now);break;}
  // Stable Review_Tasks are created only for Portal DB requests already mirrored into this cycle. Source rows are not modified.
  assignReviewTasksForCycle_(cycle,now);
}
function assignReviewTasksForCycle_(cycle,now){
  const db=SpreadsheetApp.openById(PORTAL_DB_SPREADSHEET_ID),req=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Requests').filter(r=>r.cycle_id===cycle.cycle_id),stageRules=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Review_Stage_Rules').filter(r=>r.cycle_rule_id===cycle.cycle_rule_id&&r.active!=='FALSE'),reviewers=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Users');const rt=db.getSheetByName('Review_Tasks');
  req.forEach(r=>stageRules.forEach(s=>{if(s.applicable_when==='HAS_ARTWORK'&&!requestHasArtwork_(r.request_id))return;const reviewer=pickReviewer_(reviewers,s.reviewer_capability);rt.appendRow(['RT-'+Utilities.getUuid(),r.request_id,'',reviewer||'',s.review_stage,'PENDING',now,cycle.reviewer_due_at||cycle.finalist_due_at||'', '', '', '',cycle.cycle_id,s.review_stage,s.reviewer_capability,'',cycle.revision_due_at||'',1,r.status,'IN_REVIEW',now]);}));
}
function requestHasArtwork_(requestId){const items=readObjects_(PORTAL_DB_SPREADSHEET_ID,'Comms_Items').filter(x=>x.request_id===requestId);return items.some(x=>String(x.artwork_url||x.asset_url||'').trim());}
function pickReviewer_(users,cap){const field=cap==='PN'?'can_review_pn':cap==='SC'?'can_review_sc':cap==='ARTWORK'?'can_review_artwork':'';if(!field)return'';const candidates=users.filter(u=>u.status==='ACTIVE'&&String(u[field]).toUpperCase()==='TRUE');return candidates.length?candidates[0].email:'';}
function renderTpl_(tpl,data){return String(tpl||'').replace(/\{\{([^}]+)\}\}/g,(_,k)=>String(data[String(k).trim()]||''));}
function escapeHtml_(s){return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
