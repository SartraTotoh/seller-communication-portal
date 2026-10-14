import test from 'node:test';
import assert from 'node:assert/strict';
import {scheduleApprovedJob} from './schedule-publisher.mjs';

function job(platform='FACEBOOK_PAGE') {
  return {
    idempotencyKey:'FACEBOOK_PAGE:operation-1', revision:1,
    accountId:'123456', contentType:'POST', caption:'Approved test draft',
    providerVideoId: 'Video_test_123',
    scheduledAt:'2030-01-01T02:00:00Z',
    approvalStatus:'APPROVED', approvedBy:'authorized-reviewer',
    approvedAt:'2026-10-14T08:00:00Z', reviewerApproved:true,
    policyApproved:true, deliveryStatus:'NOT_SENT', neverPublishedVerified:true,
    platform
  };
}
function deps(input, f) {
  const outcomes=[],claims=[],calls=[];
  const d={
    enablePublishing:true,loadApprovedJob:async()=>input,
    assertCanPublish:async(a)=>{if(a!=='publisher')throw Error('ROLE_DENIED');},
    assertAllowedAccount:async()=>true,
    claimDispatch:async(k,v)=>{claims.push([k,v]);return {claimed:claims.length===1};},
    readSecret:async()=> 'test-provider-oauth-token-secret',
    recordOutcome:async(j,o)=>{outcomes.push(o)},
    fetchImpl:async(u,opts)=>{calls.push({url:u,opts});return f(u,opts)},
    metaVersion:'v26.0'
  };
  return {d,calls,claims,outcomes};
}
const ok=x=>({ok:true,status:200,json:async()=>x});

test('production shipping flag disables all provider operations',async()=>{
  const x=deps(job(),()=>{throw Error('MUST_NOT_SEND')});x.d.enablePublishing=false;
  await assert.rejects(scheduleApprovedJob({jobId:'JOB-1',actor:'publisher',now:new Date('2026-10-14')},x.d),/PUBLISHING_DISABLED/);
  assert.equal(x.calls.length,0);assert.equal(x.claims.length,0);
});
test('draft and unreviewed content never reach a provider',async()=>{
  const j=job();j.approvalStatus='PENDING_REVIEW';const x=deps(j,()=>{throw Error('MUST_NOT_SEND')});
  await assert.rejects(scheduleApprovedJob({jobId:'JOB-1',actor:'publisher',now:new Date('2026-10-14')},x.d),/REVIEW_AND_POLICY_APPROVAL_REQUIRED/);
  assert.equal(x.calls.length,0);
});
test('reject unapproved Facebook Group and role misassignment',async()=>{
  const g=deps({...job(),platform:'FACEBOOK_GROUP'},()=>{throw Error('MUST_NOT_SEND')});
  await assert.rejects(scheduleApprovedJob({jobId:'JOB-1',actor:'publisher',now:new Date('2026-10-14')},g.d),/PLATFORM_NOT_PUBLISHABLE/);
  const p=deps(job(),()=>{throw Error('MUST_NOT_SEND')});
  await assert.rejects(scheduleApprovedJob({jobId:'JOB-1',actor:'requester',now:new Date('2026-10-14')},p.d),/ROLE_DENIED/);
  assert.equal(g.claims.length,0);assert.equal(p.claims.length,0);
});
test('Facebook provider scheduled POST verified by GET, no token in URL',async()=>{
  const x=deps(job(),(url,opts)=>{
    if(opts.method==='POST')return ok({id:'123456_789'});
    if(opts.method==='GET')return ok({id:'123456_789',is_published:false,scheduled_publish_time:1893481200});
    throw Error('UNEXPECTED');
  });
  const result=await scheduleApprovedJob({jobId:'JOB-1',actor:'publisher',now:new Date('2026-10-14')},x.d);
  assert.equal(result.providerContentId,'123456_789');
  assert.equal(x.outcomes.at(-1).state,'SCHEDULED');
  assert.equal(x.calls.filter(c=>c.opts.method==='POST').length,1);
  assert.ok(x.calls.every(c=>!c.url.includes('oauth-token-secret')));
  assert.equal(x.calls[0].opts.headers.Authorization,'Bearer test-provider-oauth-token-secret');
  assert.ok(x.calls[0].opts.body.includes('scheduled_publish_time='));
});
test('provider HTTP error locks unknown outcome without automatic retries',async()=>{
  const x=deps(job(),()=>({ok:false,status:503,json:async()=>({})}));
  await assert.rejects(scheduleApprovedJob({jobId:'JOB-1',actor:'publisher',now:new Date('2026-10-14')},x.d),/PROVIDER_HTTP_503/);
  assert.equal(x.claims.length,1);
  assert.equal(x.calls.length,1);
  assert.equal(x.outcomes.at(-1).state,'DISPATCH_UNKNOWN');
});
test('YouTube scheduling must target already private and never published video',async()=>{
  const j=job('YOUTUBE');j.idempotencyKey='YOUTUBE:operation-2';
  const calls=[];const x=deps(j,(url,opts)=>{
    if(opts.method==='GET'){const n=calls.filter(y=>y==='GET').length;calls.push('GET');
      return ok({items:[{id:j.providerVideoId,status:{privacyStatus:'private', ...(n>0?{publishAt:j.scheduledAt}:{})}}]})}
    if(opts.method==='PUT'){calls.push('PUT');return ok({id:j.providerVideoId})}
    throw Error('UNEXPECTED');
  });
  const result=await scheduleApprovedJob({jobId:'JOB-2',actor:'publisher',now:new Date('2026-10-14')},x.d);
  assert.equal(result.provider,'YOUTUBE');
  assert.deepEqual(calls,['GET','PUT','GET']);
  assert.equal(x.outcomes.at(-1).state,'SCHEDULED');
  const put=x.calls.find(c=>c.opts.method==='PUT');
  assert.equal(JSON.parse(put.opts.body).status.privacyStatus,'private');
  assert.equal(JSON.parse(put.opts.body).status.publishAt,j.scheduledAt);
});
test('YouTube public video fails with no update to provider',async()=>{
  const j=job('YOUTUBE');const x=deps(j,()=>ok({items:[{id:j.providerVideoId,status:{privacyStatus:'public'}}]}));
  await assert.rejects(scheduleApprovedJob({jobId:'JOB-1',actor:'publisher',now:new Date('2026-10-14')},x.d),/YOUTUBE_PRIVATE_VIDEO_REQUIRED/);
  assert.ok(x.calls.every(c=>c.opts.method==='GET'));
  assert.equal(x.outcomes.at(-1).state,'DISPATCH_UNKNOWN');
});
test('idempotency CAS refusal prevents second provider call',async()=>{
  const x=deps(job(),()=>{throw Error('MUST_NOT_SEND')});
  x.d.claimDispatch=async()=>({claimed:false});
  await assert.rejects(scheduleApprovedJob({jobId:'JOB-1',actor:'publisher',now:new Date('2026-10-14')},x.d),/IDEMPOTENCY_KEY_ALREADY_CLAIMED/);
  assert.equal(x.calls.length,0);
});
