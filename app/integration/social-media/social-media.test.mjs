import test from 'node:test';
import assert from 'node:assert/strict';
import {providerCapabilities,normalizeSocialContent,normalizePerformance,
  normalizeSocialComment,buildPublicationDraft,planFacebookGroupIntake
} from './contracts.mjs';
import {createFacebookPageReader,createYoutubeReader} from './readers.mjs';
import {mapYoutubeTopLevelComment,youtubeThreadRepliesComplete,
  buildApprovedSentimentSummary} from './mappers.mjs';

test('Facebook Groups API remains unsupported even for admins', () => {
  const p=providerCapabilities('FACEBOOK_GROUP');
  assert.equal(p.automatedReading,false);
  assert.equal(p.automatedPublishing,false);
  assert.equal(p.manualAdminEvidenceImport,true);
  assert.throws(()=>normalizeSocialComment({
    platform:'FACEBOOK_GROUP',accountId:'123',providerContentId:'post1',providerCommentId:'comment1'
  }),/FACEBOOK_GROUPS_API_UNAVAILABLE/);
  assert.equal(planFacebookGroupIntake({
    groupId:'123',postUrl:'https://www.facebook.com/groups/123/posts/456'
  }).automaticApiCollection,false);
});

test('Post and comment IDs are stable, deduplicable and privacy-scoped', () => {
  const p=normalizeSocialContent({platform:'FACEBOOK_PAGE',accountId:'111',providerContentId:'111_222'});
  assert.equal(p.key,'FACEBOOK_PAGE:111:111_222');
  const c=normalizeSocialComment({
    platform:'YOUTUBE',accountId:'UC_test',providerContentId:'video_1',
    providerCommentId:'Ugz_test',text:'sample',authorEmail:'should-not-appear'
  });
  assert.equal(c.key,'YOUTUBE:UC_test:Ugz_test');
  assert.equal(c.autoReplyApproved,false);
  assert.equal('authorEmail' in c,false);
});

test('Unavailable metrics remain null and not fabricated as zero', () => {
  const p=normalizePerformance({
    platform:'YOUTUBE', accountId:'UC_test',
    providerContentId:'video_1', metrics:{views:123,likes:0}
  });
  assert.equal(p.views,123);
  assert.equal(p.likes,0);
  assert.equal(p.impressions,null);
  assert.equal(p.watchTimeMinutes,null);
});

test('Publication queue creation is approval-blocked and idempotent', () => {
  const p=buildPublicationDraft({
    platform:'FACEBOOK_PAGE',accountId:'1234',requestId:'REQ-123',
    commsItemId:'COM-1',clientOperationId:'op-1',
    caption:'Draft',scheduledAt:'2030-01-01T08:00:00Z'
  },new Date('2026-01-01T00:00:00Z'));
  assert.equal(p.deliveryStatus,'NOT_SENT');
  assert.equal(p.approvalStatus,'PENDING_REVIEW');
  assert.equal(p.canDispatch,false);
  assert.equal(p.idempotencyKey,'FACEBOOK_PAGE:op-1');
  assert.throws(()=>buildPublicationDraft({
    platform:'FACEBOOK_GROUP',accountId:'1234',requestId:'REQ-123',
    commsItemId:'COM-1',clientOperationId:'op-2',scheduledAt:'2030-01-01T08:00:00Z'
  }),/FACEBOOK_GROUPS_API_UNAVAILABLE/);
});

test('Meta readers use Authorization header; never include tokens in URL', async () => {
  const seen=[];
  const fetchImpl=async(url,opts)=>{seen.push({url,headers:opts.headers});return {
    ok:true,status:200,json:async()=>({data:[],paging:{}})
  };};
  const meta=createFacebookPageReader({accessToken:'meta-page-token-in-memory-only',fetchImpl});
  await meta.listPosts('123',{limit:100});
  await meta.listComments('123_456');
  assert.equal(seen.length,2);
  assert.equal(seen[0].headers.Authorization,'Bearer meta-page-token-in-memory-only');
  assert.ok(seen[0].url.includes('graph.facebook.com/v26.0/123/posts'));
  for(const s of seen)assert.equal(s.url.includes('meta-page-token-in-memory-only'),false);
  assert.throws(()=>meta.getPostInsights('123_456',['post_impressions']),/LEGACY_IMPRESSIONS/);
});

test('YouTube readers require owner OAuth and support comments and analytics', async () => {
  const seen=[];
  const mock=async(url,opts)=>{seen.push({url,auth:opts.headers.Authorization});return {
    ok:true,status:200,json:async()=>({items:[]})
  };};
  const yt=createYoutubeReader({accessToken:'youtube-owner-oauth-token',fetchImpl:mock});
  await yt.listVideoComments('video-test_1');
  await yt.channelDailyAnalytics({startDate:'2026-10-01',endDate:'2026-10-14'});
  assert.ok(seen[0].url.includes('commentThreads'));
  assert.ok(seen[1].url.includes('youtubeanalytics.googleapis.com'));
  assert.ok(seen.every(x=>!x.url.includes('youtube-owner-oauth-token')));
  assert.ok(seen.every(x=>x.auth.startsWith('Bearer ')));
});

test('Sentiment handoff includes only approved aggregates', () => {
  assert.throws(()=>buildApprovedSentimentSummary({contentKey:'c1'}),/POLICY_REVIEW_REQUIRED/);
  const e=buildApprovedSentimentSummary({
    contentKey:'YOUTUBE:UC_test:video1',periodStart:'2026-10-01',
    periodEnd:'2026-10-14',approvedBy:'REVIEWED_BY_AUTHORIZED_OPERATOR',
    positive:3,neutral:1,negative:5,topThemes:['Shipping']
  });
  assert.equal(e.counts.negative,5);
  assert.equal('comments' in e,false);
  assert.equal(e.approved,true);
});

test('YouTube replies may be partial and must be paginated', () => {
  const thread={snippet:{totalReplyCount:5,topLevelComment:{
    id:'Ug_test',snippet:{textDisplay:'test',publishedAt:'2026-10-14T00:00:00Z'}
  }},replies:{comments:[{id:'a'}]}};
  assert.equal(youtubeThreadRepliesComplete(thread),false);
  assert.equal(mapYoutubeTopLevelComment('UC_test','video_test1',thread).autoReplyApproved,false);
});
