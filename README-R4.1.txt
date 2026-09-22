SELLER COMMUNICATION PORTAL v4.9.3R4.1 - WORKSPACE PATH FIX

RUN ONLY:
  START.bat

FIXED:
- R4 resolved its own folder as app\\tools and incorrectly looked for app\\tools\\public\\index.html.
- R4.1 resolves app root correctly, then validates app\\public, app\\backend, firebase.json and .firebaserc.

DATA SAFETY:
- No Sheet reset.
- No Tracking_Links reset/delete.
- No Short_Link_Routes reset/delete.
- No Smart Link migration.
- The recovery updates Apps Script deployment access/source only after all package safety gates pass.

EXPECTED FIRST GATE:
  [1/5] Safety gate...
  R4 access validation PASS
  Existing backend deployment: AKfy...

EXPECTED FINAL:
  ACCESS FIX COMPLETE - DOMAIN + USER_DEPLOYING VERIFIED (R4.1)
