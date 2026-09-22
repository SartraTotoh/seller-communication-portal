# Three-portal integration contract — v4.9.0

## Deployment state
Seller Communication code and both browser adapters are packaged. The adapters are NOT automatically installed into the two other portal codebases. Their current source, durable data API and deployed backend URL must be mapped before end-to-end activation. No background server sync, OAuth credentials or social platform publishing adapter is fabricated by this release.

## Ownership
- Seller Education owns source tasks, task completion and creative assets.
- Seller Communication owns per-channel schedules, publication evidence, metrics and content approval revisions.
- THSP is a downstream aggregation portal. Trainer remains its major source. Never overwrite Trainer or Seller Education source records from this feed.

## Seller Education adapter
File: integration/selleredu-content-bridge.js
Import createSellerCommsBridge into the source task screen, using its actual persisted task model.
Pass endpoint (the DOMAIN + USER_ACCESSING Apps Script /exec URL from the deployed Seller Communication frontend), saveSyncState(taskId, channel, account, state), and saveTracking(taskId, channel, account, feedback).
- Add Link to Seller Communication button calling link(task).
- After the source task completion has been durably saved, call onTaskCompleted(task).
- One task payload per channel/account: taskId, taskStatus COMPLETED, title, caption, type TEXT/IMAGE/VIDEO, channel, account, owner, assetUrl, destinationUrl, destinationRequired, sourceUrl.
- Task status mapping must come from the actual source workflow, never guessed from a generic Done label.
- link retries deduplicate by taskId/channel/account; an already-linked item is returned unchanged. Later creative changes must be reviewed in Seller Communication in this release; automatic version overwrite is deliberately unsupported.
- Persist feedback by contentId + revision using an upsert. Do not add metric snapshots to prior totals.
- Call pullFeedback using persisted contentId and task/channel/account identity after login or explicit refresh. Acknowledge only AFTER saveTracking completes.
- Failed operations persist FAILED and can be retried. Do not store captions or tokens in localStorage.

## THSP adapter
File: integration/thsp-content-bridge.js
Import createThspContentBridge and supply endpoint, applySnapshot(feed) and saveSyncState(state).
- sync() / retry() retrieves Content Operations data authorized for the signed-in user's Seller Communication role.
- Display SCHEDULED / PUBLISHED records in the calendar; remove obsolete schedule entries when status changes to draft/review. Keep content and metrics as a separate read-only source projection.
- Upsert by externalId, compare revision, preserve all Trainer records and unrelated THSP fields.
- The snapshot is scoped to CONTENT_OPERATIONS_AUTHORIZED_USER. Do NOT delete records from other scopes/users when absent. This does not export the entire legacy PN/SCA/Social tracker calendar.
- An empty successful snapshot differs from a failed fetch. On failure retain last good data, display its timestamp, allow retry.
- Reconcile only this source namespace and exact viewer scope. Enforce THSP's own audience permissions again before storing/displaying information; do not widen access because the requesting operator is a Seller Communication Admin.
- Feed identifiers: SELLER_COMMS:<contentId>; taskId remains upstream identity. Each item includes readOnly and explicit ownership.

## Workspace access
The connection uses the user's existing Workspace session through a hidden form bridge. Users must be provisioned in Seller Communication. DOMAIN restrictions remain in force. First-run Google consent cannot be bypassed. There is no public anonymous data endpoint and no secret in either adapter.

## Acceptance before activation
1. Complete source task -> one content per channel/account; repeat -> no duplicate.
2. Missing required input -> source NEEDS_INPUT; manual link -> draft.
3. Schedule + publish evidence + metrics -> source task gets same IDs and measurement period.
4. Failed source write -> feedback stays pending; retry safely upserts.
5. THSP refresh -> matching calendar/status/metrics, Trainer data unchanged.
6. Requester sees only authorized own content. No cross-user snapshot deletion.
