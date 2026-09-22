SELLER COMMUNICATION PORTAL v4.6.0
LIVE SYNC ONE-CLICK PACKAGE

GOAL
- Keep current PN and SC Google Sheets as source of truth during coexistence.
- Portal reads them; Portal NEVER writes back to operational source trackers.
- Remove empty / near-empty / NA / N/A / no-state source rows from active Portal feed.
- Keep actionable incomplete requests as INCOMPLETE.
- Continuously reconcile statuses.

SOURCE LOGIC
PN - Requestor to fill in
- Remark Cancel -> CANCELLED
- Confirmed Comms type Reject -> REJECTED
- Slot ID present -> SCHEDULED
- Formula Pending -> INCOMPLETE
- Formula Completed + confirmed comm type -> APPROVED
- Formula Completed without decision -> READY_FOR_REVIEW

SC - SUBMISSION FORM + FINALIST
Join: Request ID + Asset Type
- Finalist Cancel -> CANCELLED
- Reject / Full slot -> REJECTED
- QC Process -> IN_REVIEW
- Ready + Scheduled -> SCHEDULED
- Ready -> FINALIST
- No Finalist + not ready -> INCOMPLETE
- No Finalist + cutoff -> READY_FOR_CUTOFF / PENDING_ALLOCATION
- No Finalist + pre-cutoff -> SUBMITTED / WAITING_CUTOFF

EDITABLE LOGIC
The executable mapping reads Config on every sync. Admin can change these DB keys without code changes:
- PN_STATUS_MAP
- SC_STATUS_MAP
- PN_EXCLUDED_SOURCE_STATES
- PN_QUALITY_REQUIRE_IDENTITY
- PN_QUALITY_REQUIRE_PAYLOAD
- PN_REQUIRE_SOURCE_STATE
- SC_QUALITY_REQUIRE_REQUEST_ID
- SC_QUALITY_REQUIRE_PREFERRED_DATE
- SC_QUALITY_REQUIRE_IDENTITY
- SC_QUALITY_REQUIRE_PAYLOAD
- SC_READINESS_REQUIRE_TITLE_PASS
- SC_READINESS_REQUIRE_CONTENT_PASS
- SC_READINESS_REQUIRE_DESTINATION
- SYNC_TRIGGER_MINUTES


PEOPLE & ROLES v4.6.0
- Professional People Directory layout with KPI / search / filters.
- CSV + TSV Mass Upload supports up to 2,000 people per job.
- Supplied 502-person list is reconciled once during setup, by corporate email.
- Team hierarchy is retained in Portal DB Teams Master.
- Firebase public assets do not contain the People seed.

SAFE DEFAULTS
- Backend: Google Apps Script, domain-only, execute as deployer.
- Frontend: Firebase Hosting only.
- Source trackers: read only.
- Billing: no paid service introduced by this package.

HOW TO RUN
1. Upload this ZIP to Google Cloud Shell.
2. unzip -o Seller-Comms-Portal-v4.6.0-Pro-People-Mass-Upload.zip
3. cd seller-comms-v4.6.0-pro-people
4. bash START-HERE.sh
5. Follow the terminal. Google authorization cannot be bypassed safely; it is one-time.
6. Click the setup URL printed at the end once.
7. When it says LIVE SYNC READY, refresh the Portal.

EXPECTED PORTAL BEHAVIOR
- Top global Refresh reloads the latest Portal snapshot without changing page.
- Requests > Sync now forces a PN + SC source rescan.
- Automatic backend trigger runs every 5 minutes by default.
- Portal source check runs every 60 seconds.
- Sync_Exclusions stores why source rows were filtered.
- Sync_Record_State stores source-to-Portal identity and hash.
- Sync_Runs and Sync_Checkpoints show sync health.
- Ticket_Events appends only on source payload/status change.
