SELLER COMMUNICATION PORTAL v4.8.4
REMOTE MANIFEST SELF-HEAL RELEASE

USE THIS FILE ONLY TO DEPLOY
1. Extract the ZIP to a NEW folder.
2. Close older v4.8.1 / v4.8.2 / v4.8.3 deployment terminals and setup tabs.
3. Double-click: ONE-CLICK-AUTO-DEPLOY.cmd
4. Do not copy AUTO-DEPLOY.ps1 or tools from an older release into this folder.

ROOT CAUSE FIXED IN v4.8.4
- Local appsscript.json was already DOMAIN + USER_ACCESSING.
- Google Apps Script HEAD could still report legacy ANYONE_ANONYMOUS + USER_DEPLOYING after clasp push.
- v4.8.3 only waited for the remote policy to become correct, so deployment could stop forever with REMOTE_MANIFEST_POLICY_NOT_READY.

v4.8.4 FLOW
- Read current Google Apps Script HEAD content.
- If the remote manifest is legacy, patch ONLY the manifest to DOMAIN + USER_ACCESSING using Apps Script projects.updateContent while preserving every remote source file.
- Require Google read-back verification of DOMAIN + USER_ACCESSING.
- Create the immutable version only after read-back passes.
- Verify the immutable version policy and backend release attestation.
- Try to update the existing deployment.
- If a legacy ANYONE deployment is blocked by Workspace policy, create a new DOMAIN deployment and preserve the old deployment for rollback.
- Rebind Firebase frontend to the new verified deployment ID when a replacement is created.

EXPECTED TERMINAL SIGNALS
- Safety gate validation: 251/251 PASS
- [6/10] Self-healing remote DOMAIN policy...
- Either:
  OK: remote Apps Script manifest was already DOMAIN + USER_ACCESSING.
  OR
  REMOTE MANIFEST SELF-HEAL: Google HEAD was patched to DOMAIN + USER_ACCESSING and verified by read-back.
- Immutable Apps Script source attested as backend release 4.8.4.
- If legacy migration is required: DOMAIN POLICY MIGRATION ... New DOMAIN deployment ...

DATA / FEATURE SCOPE RETAINED
- PN source: [2026] Seller Comm Request Tracker
- SCA source: [TH] Seller Centre Asset SCA Request & Allocation
- Social source: New Channel Landscape dashboard 2026 - Seller Education
- Campaign 360
- Asset Approval logic
- Beginner Guidance
- People self-heal / role fail-closed
- Source trackers remain read-only

DEPLOYMENT SAFETY RETAINED
- Firebase project: seller-communication-portal only
- education-portal-506713 is blocked
- Apps Script access: DOMAIN
- Apps Script executeAs: USER_ACCESSING
- Old legacy deployment is retained if replacement migration is required

DO NOT mark Production complete unless the One-Click command reaches its final DONE state and the live Portal confirms release 4.8.4.
