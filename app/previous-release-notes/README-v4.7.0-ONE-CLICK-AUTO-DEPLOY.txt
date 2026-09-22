Seller Communication Portal v4.7.1 - ONE CLICK AUTO DEPLOY

Goal
- Double-click ONE-CLICK-AUTO-DEPLOY.cmd on Windows.
- No Cloud Shell commands.
- No copying OAuth callback URLs into a terminal.
- Browser authorization may open on first use; approve with the corporate account and the script resumes automatically.

Hard safety locks
- Firebase Project ID: seller-communication-portal
- Firebase Project Number: 795035951703
- Firebase deploy scope: Hosting ONLY
- Explicitly blocks education-portal-506713
- Existing Apps Script /exec deployment must already exist.
- The script resolves the owner of that deployment and updates the SAME deployment ID.
- It never creates a second Apps Script backend when the live deployment cannot be resolved.

Release metadata
- Functional baseline: 4.6.0
- UI version: 4.6.8
- Portal version: 4.7.0

First run may need
- Firebase browser authorization
- Google Apps Script browser authorization
- A one-time clasp npm bootstrap if clasp is not already installed/cached

If any identity/project/deployment check fails, the package stops before Firebase Hosting write.
