Seller Communication Portal v4.7.3

Run ONE-CLICK-AUTO-DEPLOY.cmd.
No Cloud Shell and no callback URL copy/paste are required.

The launcher will:
1. lock the Firebase target to seller-communication-portal,
2. reuse the existing Apps Script project + /exec deployment,
3. push backend source,
4. update the SAME deployment ID,
5. open the existing backend ?action=setup page automatically,
6. deploy Firebase Hosting only,
7. open Production.

If Google requests company sign-in/permissions in the browser, approve them. The setup page must show LIVE SYNC READY.
After that, the Portal should show Live Tracker sync instead of Snapshot mode.
