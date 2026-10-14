# Facebook Page / YouTube Integration — Seller Comms + Seller Sentiment

Status: **staging contracts and read-only provider adapters only — NOT deployed or connected to provider accounts**.

This branch is based on the earlier security branch `fix/comms-auth-integrity-20261014`. Do **not** deploy it over the current Apps Script @24/@90 or current Firebase/Cloudflare releases without first comparing active deployed source and completing security review. The public legacy repository contained a signing secret; rotation and revocation require Security/IT approval separately.

## Goal

- **Seller Comms:** manage approved Page posts, Page videos and owned YouTube channel videos; ingest aggregate performance into a time-stamped dashboard; plan publication in a review queue.
- **Seller Sentiment:** read comments/replies associated with authorized Page posts/videos and owned YouTube videos; categorize issues and route to policy review. No automatic replies.
- **Facebook Groups (even administered by us):** Meta retired Groups API access in April 2024. The official Graph API cannot list all hosted-group posts or comments. Treat as an explicit provider limitation, not a broken token. Admin-provided, permissioned manual evidence ingestion is a separate reviewed route. No private-group scraping.

## Existing code and data

- `app/backend/ApiCenter.gs`: `API_Connections`, `API_Routes`, `API_Publication_Queue`, `API_Logs` already exist in the live Comms Google Sheet. `apiCenterSendPublication` intentionally throws. Keep this security/approval hard stop until publishing provider contract is verified.
- `Performance` is keyed by `performance_id,tracking_id,request_id,comms_item_id,metric_date` and has generic `impressions,clicks,ctr,conversions`. Do not place YouTube views or Meta video plays in generic `impressions` columns. Use a provider-specific daily fact table/read model and join via content IDs.
- `Content_Master` and `Content_Operations` remain the source for caption/artwork/approval and schedule intent.
- `Sentiment` uses its existing D1 for restricted comments; the shared Comms projection contains **approved aggregate summaries only**. No direct arbitrary cross-portal writes.

## Proposed data contracts

### SocialAccount (metadata only)
`platform,providerAccountId,displayName,ownerTeam,oauthConnectionRef,permissions,status,tokenPresence,tokenLastVerifiedAt,lastSyncAt`

The portal may display `tokenPresence` only. Token values must stay exclusively in server-side secret storage with least-privilege access, never a Google Sheet, GitHub, public HTML or browser localStorage. Connecting accounts requires the authorized Page/YouTube channel owner.

### SocialContent
`key = platform:accountId:providerContentId`

`requestId,commsItemId,contentId,campaignId,contentType,publishedAt,permalink,caption,lastSyncedAt`.

Multiple content items can belong to one Comms Request. Never assume post ID and video ID are interchangeable. Source-of-truth for a provider ID is the platform's provider response.

### SocialPerformanceDaily
`key,measuredFrom,measuredTo,metricVersion,views,uniqueViewers,impressions,reactions,likes,comments,shares,engagedUsers,clicks,watchTimeMinutes,averageViewDurationSeconds,observedAt`.

Undefined metrics remain `null`, not zero; do not sum reach and views as a single KPI. Store both time window and active metric definition, and upsert by `platform/account/content/measurementWindow/metricVersion` to avoid double-counting.

### SocialPublication
`requestId,commsItemId,platform,accountId,contentType,caption,assetRef,scheduledAt,timeZone,idempotencyKey,approvalStatus,deliveryStatus,providerPostId`.

State machine:
`DRAFT → PENDING_REVIEW → APPROVED → SCHEDULE_REQUESTED → SCHEDULED → PUBLISHED`
with `FAILED/RETRY_PENDING/CANCELLED` branches.

Mandatory: Requester can draft; Reviewer approves content; authorized Comms publisher confirms provider account and target time; backend worker alone calls the provider; unique idempotency constraint; provider ID and readback evidence are required before marking scheduled/published. No direct user-controlled provider URL.

### SocialComment (restricted to Seller Sentiment)
`key = platform:accountId:providerCommentId`

`contentKey,parentCommentId,text,createdAt,permalink,privacyClass,moderation,policyReviewStatus`.

No seller identity or raw comment text is copied into Seller Comms. Keep retention, consent, moderation and access controls with the Sentiment owner.

## API layout (proposed backend routes — NOT installed by this patch)

| Route | Intended access | Result |
| --- | --- | --- |
| `GET /v1/social/accounts` | Comms Admin | metadata + scope health, never tokens |
| `GET /v1/comms/social/content` | authorized Comms | own Page/YouTube content list |
| `GET /v1/comms/social/performance` | authorized Comms | daily/channel/campaign KPIs with provenance |
| `POST /v1/comms/publications/drafts` | Requester/Comms | validated unpublished draft only |
| `POST /v1/comms/publications/:id/approve` | Reviewer | explicit approval audit |
| `POST /v1/comms/publications/:id/schedule` | Publisher | only after review, provider rights and idempotency |
| `GET /v1/comms/publications/:id` | authorized Comms | delivery status/readback receipt |
| `GET /v1/sentiment/social/comments` | Sentiment Admin/Reader | restricted comments, paged |
| `POST /v1/sentiment/social/sync` | service/admin | idempotent owned media sync |
| `POST /v1/sentiment/groups/manual-import` | privileged group admin | **manual permissioned evidence**, no automated Groups API |
| `GET /v1/social/sync-health` | operator | last success, cursor, staleness, provider errors without secrets |

## Connector code in this patch

- `contracts.mjs`: platform capability rules, post/performance/comment normalization, approval-blocked draft creation, group manual intake.
- `readers.mjs`: server-side **GET only** clients for Page posts, videos, comments and current insights, plus YouTube uploads, videos, comments/replies and Analytics. Caller supplies runtime OAuth secrets via a backend token vault; readers never put tokens in URLs or API responses.
- `mappers.mjs`: stable provider IDs and privacy-safe, reviewed aggregate handoff.
- `social-media.test.mjs`: mocked API readers, group limitation, no token in URL, metric null semantics, drafts never auto-publish, sentiment privacy.

These are libraries, not a running API server. There is no `POST` to Meta/YouTube in this patch, no live publication and no credentials.

Run locally: `node --test app/integration/social-media/social-media.test.mjs`.

## Provider authorization

**Facebook Pages:** request minimum reviewed permissions based on the specific use: `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `read_insights`; writing Page posts requires `pages_manage_posts`. Webhooks may require `pages_manage_metadata`. Verify App Review/Business Verification and page task rights. Tokens should be issued by an approved Meta Business/App administrator and stored in secret storage. Prefer Page webhooks for near-real-time events and periodic polling with cursors as a fallback.

**Graph API metric update:** Do **not** copy the screenshot's old v21/v22 `post_impressions` metric list. Version v25/v26 deprecated several old impressions/reach metrics in 2026. Resolve supported metric names per current version; return `UNAVAILABLE` with evidence rather than interpreting errors as zero. `readers.mjs` deliberately rejects `post_impressions*`.

**YouTube:** public `videos.list` can use an API key; **owned channel Analytics, uploads and publishing require the channel owner's OAuth**, not merely an API key. Use `channels.list(mine=true)` to determine the uploads playlist and `playlistItems.list`, `videos.list` for videos. Analytics uses `reports.query` and granted current read scopes. Comments via `commentThreads.list`; retrieve extra replies via `comments.list(parentId)` because embedded replies can be incomplete. Use channel upload OAuth with `videos.insert`; for scheduled publishing `status.publishAt` requires `status.privacyStatus=private` and a video not yet published. Verify Google Cloud quota/audit requirements. Quota belongs to the Cloud project, not each API key.

**Page scheduling:** use the supported Page `/feed` scheduling API only after scope/approval validation. Video/Reels and YouTube require different upload/scheduling workflows. Verify the provider's scheduled/readback state and store the returned ID; do not report success from a local queue alone.

**Facebook Group:** Groups API and `groups_access_member_info`/`publish_to_groups` were removed April 22, 2024, including when an admin owns the group. Do not evade that restriction with private-group scraping or account cookies. Manual evidence intake must have admin authority, policy clearance, a traceable source and a privacy/retention review.

## Operational gates before any production deployment

1. Recover current Comms Request UI and Sentiment LINE/Facebook Settings first (user-reported P0 regressions). This social feature may not mask or override these.
2. Obtain **authorized Page IDs and owned YouTube Channel ID(s)** and actual approved App/Cloud project scope lists, not tokens pasted in ChatGPT.
3. Confirm the current production source and GitHub branch parity, and complete the previously reported HMAC exposure security review.
4. Wire adapters into the real deployed backends with durable cursors, bounded paging, 429 retries, backfill, tombstone handling, consent and data retention.
5. Validate 3 owned Page posts and 3 owned YouTube videos through read-only APIs; compare IDs/performance with native dashboards and record missing metrics.
6. Backfill comments (with replies) idempotently into Seller Sentiment; no auto-responses, no cross-portal raw comment export.
7. Test review→schedule→provider readback in authorized sandbox/test Page and test YouTube channel. Demonstrate cancellation/rollback, duplicate prevention, immutable audit.
8. Obtain owner/IT approval for cross-portal data contract. Roll out with a feature flag and monitor error/staleness. Do not send messages or post content until expressly authorized.

## Reference documentation

- Meta Graph API v19 deprecation: https://developers.facebook.com/docs/graph-api/changelog/version19.0/
- Meta Graph API v25 changelog: https://developers.facebook.com/docs/graph-api/changelog/version25.0/
- YouTube Data API: https://developers.google.com/youtube/v3/docs
- YouTube Analytics: https://developers.google.com/youtube/analytics/reference/reports/query


## APPROVAL-GATED NATIVE SCHEDULING ADAPTER (added 14 Oct 2026)

This branch now contains \`schedule-publisher.mjs\` and \`schedule-publisher.test.mjs\`. It can perform actual authorized provider scheduling when wired to an approved backend, but **it is disabled by default, not connected to production, and contains no credentials**.

Supported first cut:
- **Meta Facebook Page text-only post:** \`POST /{page-id}/feed\`, \`published=false\`, \`unpublished_content_type=SCHEDULED\`, future \`scheduled_publish_time\`. Immediately verify \`GET /{post-id}\` with \`is_published=false\` and matching scheduled time. Requires approved Page app scopes, page task rights and current Graph version.
- **YouTube existing private, never-published video:** owner OAuth; verify \`videos.list(part=status)\` returns private, then \`videos.update(part=status)\` with preserved writable status and \`privacyStatus=private,publishAt=<UTC>\`; read back and confirm \`publishAt\`. Uploading a new video and scheduling Facebook photo/video/Reels are separate approved adapters, **not implemented here**.
- Facebook Group scheduled publishing is not supported through the discontinued Groups API.

**Safe activation checklist — all mandatory:**
1. Fix live Comms missing Requests and Sentiment missing LINE/Facebook settings first; do not replace current production with this older public mirror.
2. Implement authenticated backend API and server-side feature flag \`enablePublishing=false\` until operations sign off. Frontend can never set this flag.
3. Map stored \`requestId/commsItemId/assetRef\` to allowed provider account and staged draft. Assign two distinct Reviewer and Publisher roles, preserve revision and policy approval.
4. Implement server-owned \`loadApprovedJob\`, \`assertCanPublish\`, \`assertAllowedAccount\`, atomic persistent \`claimDispatch(idempotencyKey,revision)\`, \`readSecret\`, and \`recordOutcome\`. **All six are required**, no in-memory locks.
5. Never put OAuth/Page access tokens in Google Sheets, frontend, GitHub or browser storage. Only privileged backend secret store.
6. Schedule a test post/video on an explicitly approved sandbox Page/channel, verify returned provider ID/time and native UI. On unknown provider outcome, leave dispatch locked for manual/provider reconciliation; never blindly retry.
7. Add durable audit, separate last-run/errors, reconciliation of scheduled→published, cancel/edit if permitted, and recovery of expired credentials.
8. Only after these steps allow \`enablePublishing=true\` for scoped test accounts, then progressive rollout. Keep \`apiCenterSendPublication\` blocked until the active Apps Script/Node backend has the approved contract.

**Tests:**
\`node --test app/integration/social-media/*.test.mjs\`. The PR includes CI workflow \`.github/workflows/social-integration-tests.yml\`. Provider-mock scheduling checks cover authorization, schedule readback, CAS refusal, no automatic retries, and YouTube private state. A mocked provider test is NOT a successful actual provider publication.
