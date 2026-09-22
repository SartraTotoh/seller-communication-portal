SELLER COMMUNICATION PORTAL v4.7.6
100% CODE / PACKAGE CLOSEOUT

PRODUCTION TARGET
- Portal: https://seller-communication-portal.web.app/
- Firebase project/site: seller-communication-portal
- Firebase deployment scope: Hosting only
- Apps Script: existing production deployment updated in place
- Workspace access: DOMAIN
- Apps Script execution identity: USER_ACCESSING
- PN + SC source trackers: READ ONLY

WHAT IS CLOSED IN v4.7.6
1. Request create/edit persistence and canonical field mapping.
2. Multi-channel request persistence.
3. Review decision/comment persistence and reload recovery.
4. Source-synced workflow overlay without upstream write-back.
5. Content Hub persistence.
6. Dropdown Options persistence.
7. Business Config + history persistence.
8. Campaign Grading model-version persistence.
9. Mass Upload inline persistence through the secured bridge.
10. Team hierarchy preservation.
11. API Center queue/approval/status/audit persistence.
12. Production Health gates.
13. Firebase Hosting <-> Apps Script write bridge parity.
14. Apps Script embedded RPC parity.
15. Fail-closed Workspace identity and role enforcement.
16. Public fallback data sanitization.
17. Cache isolation/invalidation.
18. Firebase/THSP cross-project deployment protection.

ONE-CLICK DEPLOYMENT (WINDOWS)
1. Extract this ZIP to a normal local folder.
2. Double-click: ONE-CLICK-AUTO-DEPLOY.cmd
3. Authorize Firebase and Apps Script only with the approved Seller Communication Portal corporate accounts.
4. Do not change the target to Education Portal / THSP.
5. The script must reuse/update the existing Apps Script production deployment rather than create an unrelated production URL.
6. When deployment succeeds, open Portal Settings > System > Production Health.
7. Production Health must show Release 4.7.6 and READY before live acceptance is signed off.

FINAL LIVE ACCEPTANCE
Use PRODUCTION-ACCEPTANCE-v4.7.6.txt after deployment. Live acceptance requires the real corporate Workspace/Firebase environment and therefore cannot be truthfully certified from an offline build container.

EXTERNAL CONTRACT - NOT A PORTAL CODE GAP
API Center outbound Send requires the organization-approved endpoint/auth contract. The code intentionally refuses delivery unless the connection is VERIFIED + enabled and server-side endpoint/auth settings exist. No credential or endpoint is invented by this package.

VALIDATION
See VALIDATION-v4.7.6.txt and tools/validate-v4.7.6.mjs.
