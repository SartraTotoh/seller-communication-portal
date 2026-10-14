/*
 * Adapter mappers: normalize provider-specific JSON to stable cross-portal IDs.
 * Restricted comment text is owned by Seller Sentiment; Comms receives only
 * approved aggregate feedback, never raw replies or author profiles.
 */
import { normalizeSocialContent, normalizeSocialComment } from './contracts.mjs';

export function mapFacebookPagePost(pageId, row, requestLinks = {}) {
  return normalizeSocialContent({
    platform: 'FACEBOOK_PAGE', accountId: pageId,
    providerContentId: row.id, contentType: 'POST',
    caption: row.message, permalink: row.permalink_url,
    publishedAt: row.created_time, ...requestLinks
  });
}

export function mapFacebookPageVideo(pageId, row, requestLinks = {}) {
  return normalizeSocialContent({
    platform: 'FACEBOOK_PAGE', accountId: pageId,
    providerContentId: row.id, contentType: 'VIDEO',
    caption: row.description || row.title,
    permalink: row.permalink_url, publishedAt: row.created_time,
    ...requestLinks
  });
}

export function mapYoutubeVideo(channelId, row, requestLinks = {}) {
  return normalizeSocialContent({
    platform: 'YOUTUBE', accountId: channelId,
    providerContentId: row.id,
    contentType: 'VIDEO',
    caption: row.snippet?.description || row.snippet?.title,
    permalink: 'https://www.youtube.com/watch?v=' + encodeURIComponent(row.id),
    publishedAt: row.snippet?.publishedAt,
    ...requestLinks
  });
}

export function mapFacebookPageComment(pageId, postId, row) {
  return normalizeSocialComment({
    platform: 'FACEBOOK_PAGE', accountId: pageId,
    providerContentId: postId, providerCommentId: row.id,
    parentCommentId: row.parent?.id,
    createdAt: row.created_time, text: row.message,
    permalink: row.permalink_url
  });
}

export function mapYoutubeTopLevelComment(channelId, videoId, thread) {
  const raw = thread?.snippet?.topLevelComment;
  if (!raw) throw new Error('YOUTUBE_TOP_COMMENT_REQUIRED');
  return normalizeSocialComment({
    platform: 'YOUTUBE', accountId: channelId, providerContentId: videoId,
    providerCommentId: raw.id, createdAt: raw.snippet?.publishedAt,
    text: raw.snippet?.textOriginal || raw.snippet?.textDisplay,
    permalink: 'https://www.youtube.com/watch?v=' +
      encodeURIComponent(videoId) + '&lc=' + encodeURIComponent(raw.id)
  });
}

export function youtubeThreadRepliesComplete(thread) {
  const expected = Number(thread?.snippet?.totalReplyCount || 0);
  const included = Array.isArray(thread?.replies?.comments) ? thread.replies.comments.length : 0;
  return included >= expected;
}

export function buildApprovedSentimentSummary({ contentKey, periodStart, periodEnd, approvedBy,
  positive = 0, neutral = 0, negative = 0, topThemes = [] } = {}) {
  if (!approvedBy || !contentKey || !periodStart || !periodEnd) throw new Error('POLICY_REVIEW_REQUIRED');
  if (!Array.isArray(topThemes) || topThemes.some(x => typeof x !== 'string')) throw new Error('INVALID_THEMES');
  const counts=[positive, neutral, negative].map(Number);
  if (counts.some(x => !Number.isSafeInteger(x) || x < 0)) throw new Error('INVALID_SENTIMENT_COUNTS');
  return {
    eventType: 'SELLER_SENTIMENT_AGGREGATE_APPROVED',
    schemaVersion: 1,
    contentKey: String(contentKey),
    from: new Date(periodStart).toISOString(), to: new Date(periodEnd).toISOString(),
    counts: {positive: counts[0], neutral: counts[1], negative: counts[2]},
    topThemes: topThemes.slice(0,10).map(x => x.slice(0,100)),
    approved: true,
    // No raw comments, seller identities, private group content, or tokens.
    owner: 'SELLER_SENTIMENT', consumer: 'SELLER_COMMS'
  };
}
