SELLER COMMUNICATION PORTAL v4.8.0
LIVE SYNC SELF-HEAL + RUNTIME ATTESTATION

USE THIS FILE ONLY TO DEPLOY
1. Extract this ZIP to a NEW folder.
2. Double-click: ONE-CLICK-AUTO-DEPLOY.cmd
3. Do not run v4.7.8 / v4.7.9 from an older extracted folder.

WHAT v4.8.0 FIXES
- Fixes the repeated LIVE SYNC SETUP FAILED / Admin permission required loop.
- Repairs deterministic People baseline BEFORE the Admin gate during first/recovery setup.
- Missing bundled identities are inserted without bulk-overwriting existing user rows.
- Only the currently signed-in identity that is already an ADMIN in the bundled seed may be repaired to ADMIN before the first successful READY state.
- After LIVE_SYNC_SETUP_STATUS=READY, automatic bootstrap repair is disabled so Users sheet role/status decisions remain authoritative.
- Setup page always shows Backend release: v4.8.0 and the resolved Workspace identity.
- Setup URL rejects a mismatched requested release.
- Deployment updater verifies the exact immutable Apps Script version contains the v4.8.0 TrackerSync / Closeout / LiveSync self-heal source BEFORE setup is opened.

BEGINNER GUIDANCE RETAINED
- Beginner Guides toggle in the Top Bar.
- Hover/focus explanations for difficult controls.
- Scroll-trigger guide cards for complex sections.
- Guided highlight, Got it / Next / Don't show again, and Guide Center.

DEPLOYMENT SAFETY RETAINED
- Firebase target: seller-communication-portal only.
- education-portal-506713 is blocked.
- Apps Script access: DOMAIN.
- Apps Script executeAs: USER_ACCESSING.
- PN / SC source trackers remain read-only.
- Public Firebase fallback remains sanitized / zero company requests.

EXPECTED SETUP PAGE
The browser setup page MUST visibly show:
- Backend release: v4.8.0
- Signed in as <your corporate email>
Then it must end with LIVE SYNC READY.

If it does NOT show Backend release: v4.8.0, close that tab: it is an older deployment/tab and must not be trusted.

EXPECTED COMMAND WINDOW
The command window must pass the immutable source attestation before opening setup, then end with:
[DONE] Seller Communication Portal v4.8.0 auto deploy completed.

LOCAL PACKAGE VALIDATION
Run:
node tools/validate-v4.8.0.mjs
Expected: Seller Communication Portal v4.8.0 validation: 179/179 PASS
