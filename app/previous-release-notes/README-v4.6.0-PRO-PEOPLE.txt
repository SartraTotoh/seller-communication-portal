SELLER COMMUNICATION PORTAL v4.6.0
PRO PEOPLE DIRECTORY + MASS UPLOAD + PROVIDED LIST

RUN
1. Upload this ZIP to Google Cloud Shell.
2. unzip -o Seller-Comms-Portal-v4.6.0-Pro-People-Mass-Upload.zip
3. cd seller-comms-v4.6.0-pro-people
4. bash START-HERE.sh
5. Complete the one Google Apps Script authorization step if prompted.
6. Open the setup URL printed by START-HERE.sh once.
7. The setup page will report People seed inserted / updated / skipped counts.
8. Open https://seller-communication-portal.web.app/?mode=ADMIN#settings and hard refresh once.

WHAT THE SETUP DOES
- Deploys the v4.6.0 frontend to the existing Firebase Hosting project only.
- Deploys the Workspace Apps Script backend.
- Ensures Users / Teams / User_Import_Jobs / User_Import_Rows schema exists.
- Reconciles the supplied 502-user list by corporate email once (idempotent marker in Config).
- Installs / refreshes the existing PN + SC Live Sync trigger.
- Runs the first PN + SC reconciliation.

MASS UPLOAD AFTER SETUP
- Portal Settings > People & Roles > Mass Upload.
- CSV and TSV are both accepted, including the exact source-column style supplied for this release.
- On Firebase Hosting, preview happens in the Portal and the final write opens the Workspace-secured import console.
- The server performs the final validation again before any User record changes.

IMPORTANT
- The supplied internal People list is included only under backend PeopleSeed.gs and imports/ for deployment/admin use.
- It is NOT present under public/ and therefore is NOT deployed to Firebase Hosting.
- PN + SC operational source sheets remain read-only.
