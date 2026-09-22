SELLER COMMUNICATION PORTAL v4.8.5
IMMUTABLE SOURCE SELF-HEAL RELEASE

USE THIS FILE ONLY TO DEPLOY
1. Close any terminal running v4.8.4 or older.
2. Extract this ZIP into a brand-new folder. Do not overwrite an older release folder.
3. Double-click: ONE-CLICK-AUTO-DEPLOY.cmd
4. Do not edit Google Workspace domain policy and do not enable ANYONE access.

WHAT v4.8.5 FIXES
- Fixes v4.8.4 VERSION_SOURCE_ATTESTATION_FAILED after manifest self-heal.
- Treats the bundled /backend source as the source of truth for known Portal Apps Script files.
- Before creating an immutable Apps Script version, overlays every bundled .gs/.html file onto Google HEAD through the Apps Script API.
- Preserves unknown remote files instead of deleting them.
- Blocks unknown remote files if they collide with Portal core symbols.
- Merges the package manifest and enforces DOMAIN + USER_ACCESSING.
- Requires Google read-back proving both source and manifest before version creation.
- Verifies immutable version source against the bundled package using normalized SHA-256 source fingerprints.
- Supports Apps Script file names returned with or without extensions/path prefixes.
- Removes stale hard-coded SETUP_V481; setup trigger tag now derives from PORTAL_BACKEND_RELEASE.
- Live Sync setup release also derives from PORTAL_BACKEND_RELEASE.

FEATURES RETAINED
- PN + SCA + Social triple-source sync.
- Campaign 360.
- Asset Validation vs Manager Approval vs Allocation separation.
- Beginner Guidance System.
- People 503 deterministic self-heal.
- Firebase Hosting-only hard lock: seller-communication-portal.
- education-portal-506713 is blocked.
- Source trackers remain read-only.

EXPECTED DEPLOY FLOW
[1/10] Safety gate -> PASS
[5/10] Backend push -> PASS
[6/10] Remote source/policy self-heal -> Google read-back -> immutable source attestation -> deployment update/replacement
Then Live Sync setup and Production verification.

EXPECTED v4.8.5 [6/10] MESSAGE
One of:
- REMOTE SOURCE SELF-HEAL: package backend source + DOMAIN manifest were overlaid ...
- REMOTE SOURCE SELF-HEAL: stale Google backend source was replaced ...
- REMOTE MANIFEST SELF-HEAL: ...
- OK: remote Apps Script source and manifest already match this release.
Then:
- OK: immutable Apps Script source attested as backend release 4.8.5.

LOCAL VALIDATION
node tools/validate-v4.8.5.mjs
Expected: Seller Communication Portal v4.8.5 validation: 259/259 PASS
