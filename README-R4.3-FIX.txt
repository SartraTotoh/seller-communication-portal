SELLER COMMUNICATION PORTAL v4.9.3R4.3

ROOT CAUSE FIX
- R4.2 used the Apps Script deployments.create request body in UPDATE shape.
- Google create API requires versionNumber / manifestFileName / description at the top level.
- R4.3 fixes CREATE payloads; UPDATE payload remains deploymentConfig-wrapped.

DATA SAFETY
- No setupPortalLiveSync call.
- No Google Sheets reset.
- No Tracking_Links reset.
- No Short_Link_Routes reset.
- Firebase deploy remains Hosting only.

RUN
Double-click START.bat only.
