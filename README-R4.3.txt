SELLER COMMUNICATION PORTAL v4.9.3R4.3 - WORKSPACE LOGIN BRIDGE
================================================================

USE THIS PACKAGE INSTEAD OF R4 / R4.1.
Run only: START.bat

WHAT R4.3 FIXES
- R4.1 centralized Drive/Sheets access under the deployer, but the Portal still
  tried to identify the viewer with Session.getActiveUser() inside that central
  backend. In that execution model the viewer email can be unavailable, which
  produced Workspace User / REQUESTER fallback.
- R4.3 separates identity from data access:
  1) a minimal DOMAIN + USER_ACCESSING auth-only Apps Script verifies the
     Workspace email (userinfo.email only),
  2) it issues a short-lived signed session,
  3) the existing DOMAIN + USER_DEPLOYING data backend verifies that session
     and uses the existing People & Roles table for the real role.

DATA SAFETY
- NO setupPortalLiveSync call.
- NO migration/reset of Google Sheets.
- Tracking_Links is not rebuilt or deleted.
- Short_Link_Routes is not rebuilt or deleted.
- Existing UTM, Tracking ID, destination, click data, and created dates remain.
- Firebase deployment scope is Hosting only.

EXPECTED USER FLOW
1. Double-click START.bat.
2. Wait for: ACCESS FIX COMPLETE - SIGNED WORKSPACE LOGIN BRIDGE VERIFIED
3. A Google Workspace sign-in page opens automatically.
4. If Google asks once, allow only the email identity permission shown.
   R4.3 does not ask each Portal user for Drive/Sheets permission.
5. You are returned to seller-communication-portal.web.app.
6. Top-right must show the real user and the role from People & Roles.

AFTER LOGIN
- Open Smart Links.
- Confirm all existing links/UTM rows are still present before running Repair.
