SELLER COMMUNICATION PORTAL v4.6.4 - ONE-CLICK CACHE-FIRST RECOVERY
===================================================================

WHY THIS RELEASE EXISTS
-----------------------
v4.6.3 could spend minutes inside npm/npx while downloading a pinned Firebase CLI.
On the corporate network this hit timeout even though a Firebase CLI had already been
successfully used by earlier attempts.

v4.6.4 removes npm download from the normal path.

WINDOWS
-------
1. Extract the ZIP.
2. Double-click ONE-CLICK-WINDOWS.cmd.
3. Keep the command window open.
4. If Google authentication is requested, complete it once in the browser.

WHAT THE ONE-CLICK FLOW DOES
----------------------------
- Validates that the package is UI v4.6.0.
- Hard-locks Firebase project ID seller-communication-portal.
- Keeps project number 795035951703 as the operator safety reference.
- Preserves the existing Live Sync Apps Script endpoint exactly.
- Reuses an existing global/cached Firebase CLI from prior npx runs.
- DOES NOT run npm install / npm exec / npx to fetch Firebase CLI.
- If no cached CLI exists, it tries the official standalone Firebase Windows binary once.
- Deploys Firebase Hosting ONLY.
- Does NOT create, push, or redeploy Apps Script in this recovery flow.
- Verifies that the live site serves data-ui-version="4.6.0" when HTTP verification is available.
- Opens the existing Live Sync setup endpoint and Admin Portal.

WHY APPS SCRIPT IS PRESERVED
----------------------------
The package already contains the existing Live Sync deployment endpoint:
https://script.google.com/a/macros/shopee.com/s/AKfycbyIZmPXPcvvjn_RdEG4dyXmjaX4QBoAjsPwB8jckqJK8mJEIQsFJk7p8--Oa266D7Wc/exec

The recovery flow intentionally avoids clasp/npm so a blocked package registry cannot stop
Firebase Hosting deployment or create a duplicate Apps Script project/deployment.

SAFETY
------
- firebase.json must be Hosting-only.
- The exact Firebase project ID is passed on every deploy.
- The backend endpoint must already match the approved endpoint or the script stops.
- Any Firebase deploy error stops the process; no second project is created.
