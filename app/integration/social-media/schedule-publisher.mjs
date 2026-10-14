/*
 * APPROVAL-GATED social scheduling adapter.
 * Integration point only: caller must implement durable storage, CAS reservation,
 * Workspace RBAC, provider-account allowlist, secret retrieval, and audit.
 * This module never runs from the browser and ships with publishing disabled.
 * NO provider calls are made without both an approved job and an explicit
 * enablePublishing feature flag granted by the deployment owner.
 *
 * Crash ambiguity: a provider could accept a POST before the response is lost.
 * Therefore the CAS reservation is NOT released or retried on any error.
 * Operators reconcile the unknown outcome using provider account/IDs first.
 */

const PROVIDERS = new Set(["FACEBOOK_PAGE", "YOUTUBE"]);
const OPAQUE_ID = /^[a-zA-Z0-9_.:-]{1,160}$/;

function opaque(value, field) {
  const v = String(value || "").trim();
  if (!OPAQUE_ID.test(v)) throw new Error("INVALID_" + field.toUpperCase());
  return v;
}
function dateInFuture(value, now, minMs) {
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) throw new Error("INVALID_SCHEDULE");
  if (at.getTime() < now.getTime() + minMs) throw new Error("SCHEDULE_TOO_SOON");
  return at;
}
async function parseProviderResponse(response) {
  if (!response?.ok) {
    const err = new Error("PROVIDER_HTTP_" + String(response?.status || "UNKNOWN"));
    err.httpStatus = response?.status;
    throw err;
  }
  return response.json();
}
function bearer(token) {
  if (typeof token !== "string" || token.trim().length < 12) {
    throw new Error("PROVIDER_CREDENTIALS_NOT_CONFIGURED");
  }
  return { Authorization: "Bearer " + token, Accept: "application/json" };
}
function metaURL(version, path, query = null) {
  const v = String(version || "v26.0");
  if (!/^v[0-9]+\.[0-9]+$/.test(v)) throw new Error("INVALID_META_VERSION");
  const u = new URL("https://graph.facebook.com/" + v + "/" + path);
  for (const [key, value] of Object.entries(query || {})) u.searchParams.set(key, value);
  return u.toString();
}
function ytURL(path, query = null) {
  const u = new URL("https://www.googleapis.com/youtube/v3/" + path);
  for (const [key, value] of Object.entries(query || {})) u.searchParams.set(key, value);
  return u.toString();
}
function checkScheduleJob(job, now) {
  if (!job || job.approvalStatus !== "APPROVED" ||
      !job.approvedBy || !job.approvedAt ||
      !job.reviewerApproved || !job.policyApproved) {
    throw new Error("REVIEW_AND_POLICY_APPROVAL_REQUIRED");
  }
  if (job.deliveryStatus !== "NOT_SENT") throw new Error("JOB_ALREADY_DISPATCHED_OR_UNCERTAIN");
  if (!PROVIDERS.has(job.platform)) throw new Error("PLATFORM_NOT_PUBLISHABLE");
  opaque(job.idempotencyKey, "idempotencyKey");
  opaque(job.accountId, "accountId");
  const when = dateInFuture(job.scheduledAt, now, 10 * 60 * 1000);
  if (job.platform === "FACEBOOK_PAGE" && when.getTime() - now.getTime() > 30 * 86400e3) {
    throw new Error("META_SCHEDULE_EXCEEDS_30_DAYS");
  }
  if (job.platform === "FACEBOOK_PAGE") {
    if (job.contentType !== "POST" || !String(job.caption || "").trim()) {
      throw new Error("FACEBOOK_TEXT_POST_ONLY");
    }
  }
  if (job.platform === "YOUTUBE") {
    opaque(job.providerVideoId, "providerVideoId");
    if (!job.neverPublishedVerified) throw new Error("YOUTUBE_PRIOR_PUBLICATION_REVIEW_REQUIRED");
  }
  return when;
}
async function scheduleFacebookTextPost(job, scheduledAt, fetchImpl, token, graphVersion) {
  const payload = new URLSearchParams();
  payload.set("message", job.caption);
  payload.set("published", "false");
  payload.set("unpublished_content_type", "SCHEDULED");
  payload.set("scheduled_publish_time", String(Math.floor(scheduledAt.getTime() / 1000)));
  const response = await fetchImpl(metaURL(graphVersion, opaque(job.accountId, "accountId") + "/feed"), {
    method: "POST", redirect: "error",
    headers: { ...bearer(token), "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString()
  });
  const published = await parseProviderResponse(response);
  const id = opaque(published?.id, "providerPostId");
  const checked = await parseProviderResponse(await fetchImpl(metaURL(graphVersion,id,{
    fields:"id,is_published,scheduled_publish_time"
  }), { method: "GET", redirect: "error", headers:bearer(token) }));
  const verifyUnix = Number(checked?.scheduled_publish_time);
  const expectedUnix = Math.floor(scheduledAt.getTime() / 1000);
  if (String(checked?.id) !== id || checked?.is_published !== false ||
      !Number.isFinite(verifyUnix) || Math.abs(verifyUnix - expectedUnix) > 60) {
    throw new Error("META_PROVIDER_SCHEDULE_READBACK_MISMATCH");
  }
  return {provider:"FACEBOOK_PAGE",providerContentId:id,scheduledAt:scheduledAt.toISOString(),state:"SCHEDULED"};
}
async function scheduleExistingPrivateYoutubeVideo(job, scheduledAt, fetchImpl, token) {
  const id = opaque(job.providerVideoId, "providerVideoId");
  const video = await parseProviderResponse(await fetchImpl(ytURL("videos",{
    part:"status",id
  }),{method:"GET",redirect:"error",headers:bearer(token)}));
  const original = video?.items?.find(v=>v?.id===id);
  if (!original || original.status?.privacyStatus!=="private") throw new Error("YOUTUBE_PRIVATE_VIDEO_REQUIRED");
  if (original.status?.publishAt) throw new Error("YOUTUBE_ALREADY_SCHEDULED");
  // videos.update(part=status) replaces the whole status object.
  // Preserve only writable status fields; exclude read-only uploadStatus,
  // failureReason, rejectionReason, madeForKids and other provider fields.
  const writable = ["license","embeddable","publicStatsViewable",
    "selfDeclaredMadeForKids","containsSyntheticMedia"];
  const status = {privacyStatus:"private",publishAt:scheduledAt.toISOString()};
  for (const key of writable) {
    if (Object.prototype.hasOwnProperty.call(original.status,key)) status[key]=original.status[key];
  }
  const response = await fetchImpl(ytURL("videos",{part:"status"}),{
    method:"PUT",redirect:"error",
    headers:{...bearer(token),"Content-Type":"application/json"},
    body:JSON.stringify({id,status})
  });
  const updated = await parseProviderResponse(response);
  if(updated?.id !== id) throw new Error("YOUTUBE_UPDATE_RESPONSE_ID_MISMATCH");
  const verified = await parseProviderResponse(await fetchImpl(ytURL("videos",{
    part:"status",id
  }),{method:"GET",redirect:"error",headers:bearer(token)}));
  const saved = verified?.items?.find(v=>v?.id===id);
  if (saved?.status?.privacyStatus !== "private" ||
      !saved?.status?.publishAt ||
      Math.abs(Date.parse(saved.status.publishAt)-scheduledAt.getTime()) > 60000) {
    throw new Error("YOUTUBE_PROVIDER_SCHEDULE_READBACK_MISMATCH");
  }
  return {provider:"YOUTUBE",providerContentId:id,scheduledAt:scheduledAt.toISOString(),state:"SCHEDULED"};
}

/**
 * Dependencies:
 *  - loadApprovedJob(jobId): durable, authenticated read
 *  - assertCanPublish(actor, job): server RBAC check (must throw on denial)
 *  - assertAllowedAccount(job): provider account allowlist, scope check
 *  - claimDispatch(idempotencyKey, revision): durable UNIQUE CAS; {claimed:true}
 *  - readSecret(platform, accountId): secret vault / OAuth refresh
 *  - recordOutcome(job, outcome): durable audit, safe to call after failure
 *
 * No in-memory idempotency, no implicit retries after ambiguous writes.
 */
export async function scheduleApprovedJob({jobId, actor, now = new Date()}, deps) {
  if (!deps?.enablePublishing) throw new Error("PROVIDER_PUBLISHING_DISABLED");
  for (const key of ["loadApprovedJob","assertCanPublish","assertAllowedAccount",
    "claimDispatch","readSecret","recordOutcome"]) {
    if (typeof deps[key]!=="function") throw new Error("MISSING_DEPENDENCY_"+key);
  }
  const job = await deps.loadApprovedJob(opaque(jobId, "jobId"));
  const when = checkScheduleJob(job,now);
  await deps.assertCanPublish(actor,job);
  await deps.assertAllowedAccount(job);
  const claim = await deps.claimDispatch(job.idempotencyKey,job.revision);
  if (claim?.claimed !== true) throw new Error("IDEMPOTENCY_KEY_ALREADY_CLAIMED");
  try {
    const token = await deps.readSecret(job.platform,job.accountId);
    const fetchImpl = deps.fetchImpl || fetch;
    const result = job.platform==="FACEBOOK_PAGE"
      ? await scheduleFacebookTextPost(job,when,fetchImpl,token,deps.metaVersion)
      : await scheduleExistingPrivateYoutubeVideo(job,when,fetchImpl,token);
    await deps.recordOutcome(job,{state:"SCHEDULED",...result});
    return result;
  } catch(error) {
    // A provider may have succeeded even when a response/readback failed.
    // Keep the durable claim locked and reconcile before any retry.
    await deps.recordOutcome(job,{state:"DISPATCH_UNKNOWN",errorCode:
      /^[A-Z0-9_]+$/.test(String(error?.message||"")) ? error.message : "PROVIDER_OR_TRANSPORT_ERROR"});
    throw error;
  }
}
