SELLER COMMUNICATION PORTAL v4.9.3R4
WORKSPACE ACCESS FIX - DATA SAFE

RUN ONLY:
  START.bat

WHAT THIS FIXES
- Removes the broken per-user Drive/Sheets authorization page.
- Keeps access restricted to the Shopee Workspace domain.
- Changes the Apps Script Web App to execute as the deployment owner.
- Keeps Portal role identity fail-closed via Session.getActiveUser().

DATA SAFETY
- Does not run Live Sync setup.
- Does not reset or delete Tracking_Links.
- Does not reset or delete Short_Link_Routes.
- Does not write to Google Sheets during this recovery.
- Does not recreate the Portal DB.

SUCCESS MESSAGE
  ACCESS FIX COMPLETE - DOMAIN + USER_DEPLOYING VERIFIED
