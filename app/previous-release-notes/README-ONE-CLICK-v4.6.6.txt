SELLER COMMUNICATION PORTAL v4.6.6 - ONE-CLICK UI GATE FIX

WINDOWS
1. Extract the ZIP to a normal folder.
2. Double-click ONE-CLICK-WINDOWS.cmd.
3. Complete Firebase login only if requested.
4. The script deploys Firebase Hosting only to seller-communication-portal.

SAFETY CONTRACT
- Functional baseline must be v4.6.0.
- UI must be v4.6.5 or newer within the v4.6.x patch line.
- Expected Live Sync backend URL must still be embedded.
- .firebaserc must target seller-communication-portal.
- firebase.json must remain Hosting-only.
- No Apps Script project is created or redeployed by the Windows recovery path.

WHY THIS RELEASE EXISTS
v4.6.5 was a visual-only People & Roles / Mass Upload polish, but the inherited v4.6.4 gate still demanded data-ui-version=4.6.0 exactly. v4.6.6 separates the functional baseline from the UI version so approved UI patches do not get blocked.
