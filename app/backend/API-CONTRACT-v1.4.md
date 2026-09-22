# Seller Communication Portal Backend Contract v1.4

## Read-only live sync

`GET /exec?action=portalData&callback=<callback>` returns JSONP for Firebase Hosting.

Approved sources:
- PN / PNAR / EDM: `[2026] Seller Comm Request Tracker`
- SC: `[TH] Seller Centre Asset SCA Request & Allocation`
- filter: requested/preferred communication date in 2026
- SC `SUBMISSION FORM` = requested
- SC `FINALIST` = confirmed/prioritized allocation

Source trackers are read-only.

## Portal DB write actions

`POST /exec` JSON body. Corporate Workspace user is required.

```json
{"action":"request.create","payload":{}}
```

Supported actions:
- `request.create`
- `request.update`
- `review.decision`
- `cycle.save`
- `smartlink.create`

### cycle.save

```json
{
  "action":"cycle.save",
  "payload":{
    "id":"RULE-SC-NORMAL",
    "cutoffWeekday":"Tuesday",
    "cutoffTime":"15:00",
    "reminders":"24|5|1",
    "finalist":"Thursday 18:00",
    "scope":"NEXT_ONLY"
  }
}
```

`scope`:
- `NEXT_ONLY`: changes only the next open cycle and records an override.
- `ALL_FUTURE`: versions the recurring Cycle Rule.

### review.decision

```json
{
  "action":"review.decision",
  "payload":{
    "requestId":"REQ-...",
    "cycleId":"CYCLE-SC-...",
    "reviewLayer":"COMMS_REVIEW",
    "reviewerCapability":"SC",
    "decision":"NEED_REVISED",
    "revisionFields":["detail","destinationUrl"],
    "revisionDueAt":"2026-09-03 18:00:00",
    "comment":"Please clarify CTA"
  }
}
```

`NEED_REVISED` triggers the requester notification path and records the unlocked fields.

### smartlink.create

Accepts any http/https destination and UTM/custom parameters. `linkType=EXTERNAL` records `READY_FOR_EXTERNAL_SERVER`. TinyURL Free may still be created as an independent Short URL layer when requested; the External Converter itself is not called until its endpoint/authentication contract is configured.

## Time-driven cycle engine

`runCycleEngine()` is designed for an installable time-driven trigger. Recommended interval after authorization testing: every 15 minutes.

It reads:
- `Communication_Cycles`
- `Notification_Rules`
- source requests / Portal DB requests

It writes only:
- Portal DB status/audit/review/notification tables
- requester email via Workspace MailApp when enabled

It never writes to the PN or SC source tracker.
