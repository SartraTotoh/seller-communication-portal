SELLER COMMUNICATION PORTAL v4.8.1
TRIPLE SOURCE + CAMPAIGN 360 + ASSET APPROVAL

USE THIS PACKAGE ONLY
1. Extract this ZIP to a NEW folder.
2. Double-click: ONE-CLICK-AUTO-DEPLOY.cmd
3. Do not merge this folder with an older v4.8.0 / v4.7.x extraction.

LIVE DATA SOURCES (READ ONLY)
- PN: [2026] Seller Comm Request Tracker
  Spreadsheet ID: 1jCcfx0NExSfAzyj9a_lFYlIu3Re6qor9TIzaDATX7go
  Primary tab: Requestor to fill in
- SCA: [TH] Seller Centre Asset SCA Request & Allocation
  Spreadsheet ID: 1f7ZFeR4a3fnQUBm3kOeoW7wLXRFKjvsIMpCOCu6teMI
  Tabs: SUBMISSION FORM, FINALIST, PopUp Request Approval
- Social Media: 1. New Channel Landscape dashboard 2026 - Seller Education
  Spreadsheet ID: 1x6Cbg2B0t9Ji79-hL5W16-UV_L7MCZTeg3YgtOnwikM
  Primary tab: Channel Schedule 2026
  Imported social routes: Facebook, Facebook Group, YouTube, TikTok, Instagram, LINE

WHAT v4.8.1 ADDS
- Triple-source Live Sync: PN + SCA + Social Media.
- Campaign 360 page and cross-source source chips.
- Campaign grouping keeps each source Request ID auditable.
- SCA Asset Approval evidence model.
- Manager Approve / Comment / Status from PopUp Request Approval.
- FINALIST allocation as final operational evidence.
- Asset validation/readiness is NOT treated as approval.
- Blank Manager Approve is NOT rejection.
- Approval conflicts are flagged for human review.
- Social source status mapping including Published, Done, Scheduled, Ready, Working, Tentative, Waiting, Hold, Postponed and Cancel.
- Beginner Guides for Campaign 360 and Asset Approval.

SOURCE WRITE SAFETY
The three source trackers are read-only to this Portal sync. v4.8.1 writes normalized data only to the Portal-owned database. It never writes approval or status back to PN, SCA or Social source spreadsheets.

EXPECTED SUCCESS
The Apps Script setup page must show:
- Backend release: v4.8.1
- PN checkpoint: OK
- SCA checkpoint: OK
- Social checkpoint: OK

The command window must end with:
[DONE] Seller Communication Portal v4.8.1 auto deploy completed.

AFTER DEPLOYMENT
- Hard refresh https://seller-communication-portal.web.app/
- Open Requests and confirm Source chips show PN / SCA / SOCIAL where applicable.
- Open Campaign 360 and confirm campaigns can show more than one source.
- Open an SCA request and confirm the Asset Approval card is visible.
- Confirm blank Manager Approve is shown as Pending Review for Pop-Up requests, not Rejected.
- Confirm FINALIST allocation can move approval evidence to Approved by Allocation.
- Complete PRODUCTION-ACCEPTANCE-v4.8.1.txt.

LOCAL PACKAGE VALIDATION
node tools/validate-v4.8.1.mjs
Expected: Seller Communication Portal v4.8.1 validation: 233/233 PASS
