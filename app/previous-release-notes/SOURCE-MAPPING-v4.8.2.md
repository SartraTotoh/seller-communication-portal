# Seller Communication Portal v4.8.2 — Source Mapping

## Architecture

v4.8.2 uses three read-only operational sources and one Portal-owned database.

| Source | Spreadsheet ID | Primary tabs | Portal source key | Purpose |
|---|---|---|---|---|
| PN | `1jCcfx0NExSfAzyj9a_lFYlIu3Re6qor9TIzaDATX7go` | `Requestor to fill in` | `SRC-PN-REQUEST` | PN / PNAR / EDM request workflow |
| SCA | `1f7ZFeR4a3fnQUBm3kOeoW7wLXRFKjvsIMpCOCu6teMI` | `SUBMISSION FORM`, `FINALIST`, `PopUp Request Approval` | `SRC-SC-REQUEST` | Seller Centre Asset request, readiness, approval and allocation evidence |
| Social | `1x6Cbg2B0t9Ji79-hL5W16-UV_L7MCZTeg3YgtOnwikM` | `Channel Schedule 2026` | `SRC-SOCIAL-2026` | Social Media schedule/status |

Source spreadsheets are never write targets for Live Sync. Normalized rows and source-state evidence are written only to the Portal-owned DB.

## PN mapping

- Campaign -> `campaign_name`
- Requester -> `requester_email`
- Request status remains source-driven and Portal review state is kept as an overlay.
- Source Request ID is retained for auditability.

## SCA mapping

### Request/readiness layer
`SUBMISSION FORM` provides campaign, requestor, asset type, seller scope, destination, preferred dates, compliance/monetary flags and readiness fields.

### Allocation layer
`FINALIST` provides operational allocation evidence including Campaign ID, scheduled/finalist state, PIC and source Request ID.

### Approval layer
`PopUp Request Approval` provides:
- `Manager Approve`
- `Comment`
- `Status`

The campaign header matcher is tolerant of the source header line break in `Campaign Name\n(For Internal Ref)`.

### Asset Approval policy
1. `Title Validation = Pass` and `Content Validation = Pass` mean validation/readiness only.
2. Blank `Manager Approve` is not rejection.
3. Explicit Manager Approve Yes/Approved -> `APPROVED` unless conflicting allocation evidence exists.
4. Explicit Manager Approve No/Rejected -> `REJECTED` unless conflicting allocation evidence exists.
5. A valid scheduled/READY FINALIST allocation -> `APPROVED_BY_ALLOCATION`.
6. FINALIST Reject/Cancel/Full Slot -> `REJECTED_BY_ALLOCATION`.
7. Pop-Up assets with no approval/allocation evidence -> `PENDING_REVIEW`.
8. Non-Pop-Up assets without an approval requirement -> `NOT_REQUIRED`.
9. Conflicting manager and FINALIST evidence is surfaced as a conflict for human review; it is not silently resolved.

## Social Media mapping

Source: `Channel Schedule 2026`.

Imported routes:
- Facebook
- Facebook Group
- YouTube
- TikTok
- Instagram
- LINE

`SHP` and `SEH` are intentionally not imported as Social Media routes by this parser.

Key mapping:
- Topic -> Campaign
- Requester -> Requester
- Team -> Source Team
- Channel -> Social channel(s)
- Type -> Content/asset type
- Live date -> start/end date
- STATUS -> canonical Portal status
- AW / VDO Link -> artwork/content link
- AW Status -> source artwork status
- AI Check 1/2 -> source AI check status
- Final Link (FB) / Landing URL -> destination URL

Status policy:
- Published -> `PUBLISHED`
- Done -> `COMPLETED`
- Scheduled -> `SCHEDULED`
- Ready -> `READY_FOR_REVIEW` (not Approved)
- Working / Briefed -> `IN_PRODUCTION`
- Tentative / Pending / Planned / REC -> `SUBMITTED`
- Waiting / Hold / Postponed -> `SUBMITTED` + `SOCIAL_HOLD`
- Cancel -> `CANCELLED`

## Campaign 360

Campaign 360 is a Portal aggregation, not a source rewrite.

- Campaign name/topic is the primary grouping key.
- Simple trailing `(content N)` / `content N` variants are normalized into one campaign family.
- PN, SCA, Social and Portal-native Request IDs remain separate.
- Source chips show which sources participate in a campaign.
- SCA Campaign IDs and Asset Approval rollups are exposed separately.
- Campaign rollup status is advisory and derived from source request statuses.

## Data-authority rules

- Source record facts remain source-owned.
- Portal-native workflow notes/review overlays remain Portal-owned.
- Asset Approval evidence remains traceable to source row/allocation evidence.
- The public Firebase fallback contains no company request snapshot.
