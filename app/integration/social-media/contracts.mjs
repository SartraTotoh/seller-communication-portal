/*
 * Pure cross-portal social data contract (no network access, database writes, or credentials).
 * Seller Comms owns content/scheduling and aggregate performance.
 * Seller Sentiment owns restricted comment text/review records.
 */
export const PLATFORMS = Object.freeze({
  FACEBOOK_PAGE: 'FACEBOOK_PAGE',
  FACEBOOK_GROUP: 'FACEBOOK_GROUP',
  YOUTUBE: 'YOUTUBE'
});

const SUPPORTED = new Set([PLATFORMS.FACEBOOK_PAGE, PLATFORMS.YOUTUBE]);
const NON_SECRET_ID = /^[A-Za-z0-9_:-]{1,160}$/;

function required(value, field) {
  const v = String(value == null ? '' : value).trim();
  if (!v || !NON_SECRET_ID.test(v)) throw new Error('INVALID_' + field.toUpperCase());
  return v;
}
function optionalText(value, max = 8000) {
  return String(value == null ? '' : value).slice(0, max);
}
function isoOrNull(value) {
  if (!value) return null;
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? null : time.toISOString();
}
function countOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function activeProvider(value) {
  const p = String(value || '').toUpperCase();
  if (!SUPPORTED.has(p)) throw new Error(p === PLATFORMS.FACEBOOK_GROUP ? 'FACEBOOK_GROUPS_API_UNAVAILABLE' : 'UNSUPPORTED_PLATFORM');
  return p;
}

export function providerCapabilities(platform) {
  const p = String(platform || '').toUpperCase();
  if (p === PLATFORMS.FACEBOOK_GROUP) {
    return {
      platform: p, automatedReading: false, automatedPublishing: false,
      comments: false, manualAdminEvidenceImport: true,
      reason: 'Meta discontinued the Groups API and its permissions in April 2024.'
    };
  }
  if (!SUPPORTED.has(p)) throw new Error('UNSUPPORTED_PLATFORM');
  return {
    platform: p, automatedReading: true, automatedPublishing: 'REQUIRES_APPROVAL_AND_PROVIDER_AUTH',
    comments: true, manualAdminEvidenceImport: false
  };
}

export function normalizeSocialContent(record) {
  const p = activeProvider(record?.platform);
  const accountId = required(record?.accountId, 'accountId');
  const nativeId = required(record?.providerContentId, 'providerContentId');
  const type = String(record?.contentType || 'POST').toUpperCase();
  if (!['POST', 'VIDEO', 'PHOTO', 'REEL'].includes(type)) throw new Error('INVALID_CONTENT_TYPE');
  return {
    key: p + ':' + accountId + ':' + nativeId,
    platform: p,
    accountId,
    providerContentId: nativeId,
    contentType: type,
    requestId: optionalText(record?.requestId, 150),
    commsItemId: optionalText(record?.commsItemId, 150),
    campaignId: optionalText(record?.campaignId, 150),
    contentId: optionalText(record?.contentId, 150),
    publishedAt: isoOrNull(record?.publishedAt),
    permalink: optionalText(record?.permalink, 1200),
    caption: optionalText(record?.caption, 2000),
    source: 'PROVIDER_READ',
    lastSyncedAt: isoOrNull(record?.lastSyncedAt)
  };
}

export function normalizePerformance(input) {
  const post = normalizeSocialContent(input);
  const metrics = input?.metrics || {};
  // Keep absent metrics as null, never zero. Meta views != unique reach != YouTube views.
  return {
    key: post.key,
    platform: post.platform,
    accountId: post.accountId,
    providerContentId: post.providerContentId,
    measuredFrom: isoOrNull(input?.measuredFrom),
    measuredTo: isoOrNull(input?.measuredTo),
    metricVersion: optionalText(input?.metricVersion || 'provider-current', 80),
    views: countOrNull(metrics.views),
    uniqueViewers: countOrNull(metrics.uniqueViewers),
    impressions: countOrNull(metrics.impressions),
    reactions: countOrNull(metrics.reactions),
    likes: countOrNull(metrics.likes),
    comments: countOrNull(metrics.comments),
    shares: countOrNull(metrics.shares),
    engagedUsers: countOrNull(metrics.engagedUsers),
    clicks: countOrNull(metrics.clicks),
    watchTimeMinutes: countOrNull(metrics.watchTimeMinutes),
    averageViewDurationSeconds: countOrNull(metrics.averageViewDurationSeconds),
    observedAt: isoOrNull(input?.observedAt)
  };
}

export function normalizeSocialComment(input) {
  const p = activeProvider(input?.platform);
  const accountId = required(input?.accountId, 'accountId');
  const providerContentId = required(input?.providerContentId, 'providerContentId');
  const providerCommentId = required(input?.providerCommentId, 'providerCommentId');
  return {
    key: p + ':' + accountId + ':' + providerCommentId,
    contentKey: p + ':' + accountId + ':' + providerContentId,
    platform: p,
    accountId, providerContentId, providerCommentId,
    parentCommentId: optionalText(input?.parentCommentId, 150),
    createdAt: isoOrNull(input?.createdAt),
    text: optionalText(input?.text, 8000),
    permalink: optionalText(input?.permalink, 1200),
    // No author profile, token, or raw provider payload in the shared contract.
    privacyClass: 'RESTRICTED_SELLER_SENTIMENT',
    moderation: 'PENDING_REVIEW',
    autoReplyApproved: false
  };
}

export function buildPublicationDraft(input, now = new Date()) {
  const p = activeProvider(input?.platform);
  const scheduledAt = isoOrNull(input?.scheduledAt);
  if (!scheduledAt || Date.parse(scheduledAt) <= new Date(now).getTime()) {
    throw new Error('SCHEDULE_MUST_BE_IN_FUTURE');
  }
  const operationId = required(input?.clientOperationId, 'clientOperationId');
  return {
    idempotencyKey: p + ':' + operationId,
    requestId: required(input?.requestId, 'requestId'),
    commsItemId: required(input?.commsItemId, 'commsItemId'),
    platform: p,
    accountId: required(input?.accountId, 'accountId'),
    contentType: String(input?.contentType || 'POST').toUpperCase(),
    caption: optionalText(input?.caption, 8000),
    assetRef: optionalText(input?.assetRef, 1200),
    scheduledAt,
    timeZone: optionalText(input?.timeZone || 'Asia/Bangkok', 100),
    approvalStatus: 'PENDING_REVIEW',
    deliveryStatus: 'NOT_SENT',
    providerPostId: null,
    // A draft never authorizes outbound publishing.
    canDispatch: false
  };
}

export function planFacebookGroupIntake(input) {
  const groupId = required(input?.groupId, 'groupId');
  const postUrl = String(input?.postUrl || '').trim();
  if (!/^https:\/\/(?:www\.)?facebook\.com\//i.test(postUrl)) throw new Error('INVALID_GROUP_POST_URL');
  return {
    groupId, postUrl,
    intakeMode: 'AUTHORIZED_ADMIN_MANUAL_SUBMISSION',
    automaticApiCollection: false,
    status: 'AWAITING_ADMIN_EVIDENCE_AND_PRIVACY_REVIEW'
  };
}
