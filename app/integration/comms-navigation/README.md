# Seller Comms — URL Routing and Gateway Failure Recovery

**Status: staging-only source contracts and tests; NOT integrated into active \`shp-comms.web.app\` hosting or into its \`adapter.mjs\`.**

## User-reported P0 (14 October 2026)

Production console:
- \`[Shopee Sidecar] Portal bridge connected.\`
- Google \`script.googleusercontent.com\` frame: \`frame-ancestors 'self'\` **Content-Security-Policy-Report-Only** warning.
- Google HtmlService \`mae_html_user_bin...\`: \`dropping postMessage.. was from unexpected window\`.
- \`app.js:111\`: \`Backend gateway timed out (portalMeta)\`; \`adapter.mjs:98\`.
- \`app.js:134,179\`: \`Backend gateway timed out (portalData)\`; repeated refresh.

Interpretation: report-only CSP is telemetry, NOT enforcement. The unexpected-window messages originate in a Google-controlled framing/message layer and may or may not be causal. Actual blocker: authenticated request data is not being delivered by the gateway. Never silence warnings by setting wildcard message target origins or bypassing authentication. Collect runtime network/console traces and compare the live deployed sidecar \`postMessage\` source/origin and Apps Script deployment identity.

Verified original Comms Google Sheet \`Requests\`: 6,068 unique rows, with 31 source-exception rows historically excluded (approximately 6,037 active). Latest observed PN/SC/Social checkpoints: 12 Oct 2026, SUCCESS. These results prove source data is present, not that this user's permission-scoped production UI loads correctly.

## Routes to mount in **the active production app.js**

| Canonical path | Page | Explicit level | Back |
| --- | --- | --- | --- |
| \`/\` | Dashboard | L1 | None |
| \`/request\` | Requests | L2 | \`/\` |
| \`/request/newrequest\` | Single Request form | L3 | \`/request\` |
| \`/request/massrequest\` | Existing Mass Request screen | L3 | \`/request\` |
| \`/request/detail/:id\` | Request Detail | L3 | \`/request\` |
| \`/request/detail/:id/edit\` | Editor | L4 | \`/request/detail/:id\` |
| \`/request/detail/:id/review\` | Review | L5 | \`/request/detail/:id/edit\` |
| \`/published\` | Published Library | L2 | \`/\` |

**Frontend code must mount actual existing screens, not merely change the URL or display a fake "Mass Request" view.** \`route-contract.mjs\` returns metadata and the navigation controller; the active app must call \`render(route)\` and mount the correct view. For a modal-based New Request screen, navigate to its URL on open and to the configured parent URL on close. Prompt before leaving forms with unsaved changes.

Example integration:

\`\`\`js
import {createRouteController} from './route-contract.mjs';
// Place a bundled/copied module at the correct hosted path before enabling.
const router = createRouteController({
  history: window.history,
  location: window.location,
  eventTarget: window,
  canLeave: (_from,to) => confirmUnsavedChangesBeforeRoute(to),
  render: (route) => {
    // Map to CURRENT actual screens, not the obsolete GitHub v5 preview.
    showActualPortalScreen(route.page, route.requestId);
    setPageBackVisibility(route.showBack,route.backHref);
  }
});
router.start();
document.querySelector('[data-navigate-newrequest]').addEventListener('click',
  () => router.navigate('/request/newrequest'));
\`\`\`

Firebase Hosting: retain \`{"source":"**","destination":"/index.html"}\` SPA rewrite (check actual deployed \`firebase.json\`, not the legacy repository's config). Validate a direct GET/refresh on each path with an authenticated browser. A 200 response from a rewrite is NOT proof that the correct screen is mounted.

## Data recovery architecture for actual gateway \`adapter.mjs\`

\`gateway-resilience.mjs\` is a back-end read-state contract for a verified principal/role. It is NOT a drop-in replacement for existing Apps Script \`google.script.run\`, \`script.googleusercontent.com\` iframe, cross-window sidecar, or OAuth. Its test dependencies simulate authenticated backend and durable server-side last-good cache.

In the current production code inspect \`adapter.mjs:98\` and:
1. Find the **exact** \`portalMeta\`/\`portalData\` URL and request initiation; compare the actual Apps Script Auth Bridge @24 and Data API @90 deployment/allowed origins/session claims, without printing secrets.
2. Verify whether the iframe is created under Firebase; whether \`Content-Security-Policy-Report-Only\` is replaced by enforced CSP anywhere; inspect request errors, response codes, and the expected \`event.source\` + \`event.origin\` for each legitimate sender. Do not accept \`postMessage\` from any origin or window.
3. Avoid browser-to-Apps-Script HtmlService framing as the long-term data transport. Prefer a SAME-ORIGIN \`/api/comms/*\` server gateway on authorized Firebase Cloud Functions/Cloud Run with Google Workspace-issued identity verified by the server, server-side Sheets API read access and a durable paginated read model. Never move Google OAuth tokens or seller PII into public frontend JS.
4. \`portalMeta\` fetch is independent and best-effort; a metadata timeout must not blank the Request list.
5. \`portalData\` needs pagination with bounded \`limit<=100\`, stable IDs, response counts and checkpoint dates. Do NOT fetch/serialize all 6,037 records into one Apps Script JSONP/iframe response on every load.
6. On a timeout/5xx/network issue, retain the last validated, server-scoped snapshot and display \`STALE\` + last successful sync timestamp; do NOT set \`requests=[]\`. A 401/403 must fail closed, with re-login, never serve stale data to an unauthorized session.
7. Deduplicate concurrent refreshes, use cooldown and bounded exponential backoff rather than repeated 30-second requests while degraded. Do not claim successful sync because a ping returns HTTP 200. Verify first/last Request IDs and live role-filtered counts, error rates, and replay after recovery.
8. Establish an atomic snapshot publication process. An incomplete Google Sheet sync must not overwrite the last-good production read model. Use idempotent keys for re-sync/backfill, stable source IDs, a minimum retained-count guard, checksum reconciliation, auditable \`lastSuccessfulSyncAt\`, and alerts on failed/stale sync.

**Do not deploy the stale public GitHub repository over the active frontend.** Current production artefacts per prior audit are in \`C:\Users\totoh.taponchai\Documents\shp-com\deploy_build\public\app.js\` and \`adapter.mjs\` and were newer/different from the public legacy GitHub tree. Before attempting a live fix, obtain those two active files + \`firebase.json\`, compare deployed byte hashes, and apply the minimal reviewed patch. Capture actual authenticated browser UAT.

## Testing and guardrails

Run:
\`node --test app/integration/comms-navigation/*.test.mjs\`

This PR has mocked route/back/data resilience tests. It does NOT establish production readiness, validate real Google Sidecar CSP behavior, connect a provider token or sync actual Seller Comms Requests.

Do not merge before P0 source parity, security review of the public repo and credentials, and authorized staging/production UAT.
