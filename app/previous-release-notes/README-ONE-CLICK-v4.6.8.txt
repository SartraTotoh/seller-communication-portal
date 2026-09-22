SELLER COMMUNICATION PORTAL v4.6.8 - WORKFLOW INTELLIGENCE

Functional baseline: 4.6.0
UI version: 4.6.8
Portal Version: 4.6.8

New capabilities
- Campaign Grading dual-source observation (read-only)
- Smart Link pre-publish gate
- Request-wide Content Intelligence
- Computer artwork upload + deterministic technical image validation
- Optional approved Workspace AI enrichment via server-side PORTAL_AI_ENDPOINT

Security / cost rules
- Source trackers remain read-only from Portal sync.
- AI endpoint is never exposed in Firebase Hosting.
- No public AI API key is packaged.
- Smart Link remains TinyURL Free / tracking URL; no paid subscription is introduced.
- Artwork uploads use Workspace Drive and require the added Drive authorization scope.
