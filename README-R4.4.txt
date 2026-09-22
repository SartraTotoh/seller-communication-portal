SELLER COMMUNICATION PORTAL v4.9.3R4.4 - TOP-LEVEL WORKSPACE LOGIN HANDOFF

WHY R4.3 LOOKED LOGGED IN BUT STILL SHOWED WORKSPACE USER
- R4.3 successfully deployed the auth bridge.
- The auth bridge used location.replace() from inside the Apps Script HtmlService sandbox iframe.
- That navigated the inner iframe to Firebase instead of navigating the browser top level.
- The address bar therefore remained script.google.com and the Portal was trapped inside the Apps Script wrapper.

R4.4 FIX
- No automatic iframe navigation.
- After Google verifies the Workspace email, the bridge shows one orange button:
  Continue to Seller Communication Portal
- The button uses target=_top, so the signed session lands on seller-communication-portal.web.app as the real top-level page.

RUN
1. Extract to a NEW folder.
2. Double-click START.bat only.
3. Wait for ACCESS FIX COMPLETE.
4. In the browser page, click the orange Continue to Seller Communication Portal button ONCE.
5. The address bar must change to seller-communication-portal.web.app/?workspace=verified... then the token fragment is removed automatically.

DATA SAFETY
- No setupPortalLiveSync call.
- No Tracking_Links reset.
- No Short_Link_Routes reset.
- No source Tracker write.
- Backend deployment source changes only in AuthSession secret injection; data/business logic remains protected.
