Seller Communication Portal Backend v3.7

Source of truth (read-only):
- PN / PNAR / EDM: [2026] Seller Comm Request Tracker (1jCcfx0NExSfAzyj9a_lFYlIu3Re6qor9TIzaDATX7go)
- SC: [TH] Seller Centre Asset SCA Request & Allocation (1f7ZFeR4a3fnQUBm3kOeoW7wLXRFKjvsIMpCOCu6teMI)
- SC SUBMISSION FORM = requested; FINALIST = confirmed/allocation result.
- Only requested/preferred communication dates in 2026 are returned.

Portal DB:
1eWFb1PGngH1dzT993G0yfvNG-BvNVJQ66NtjdzIMyAU

Cycle engine:
- PN cutoff Tuesday 12:00 Asia/Bangkok.
- SC cutoff Tuesday 15:00 Asia/Bangkok.
- Upcoming cycle window = next Monday-Sunday.
- SC review layers: Comms review, then Artwork review when artwork exists.
- Need Revised reopens only configured fields in the production ticket layer.
- Notification rules are data-driven in Notification_Rules.
- Install a time-driven trigger for runCycleEngine (recommended 15 minutes) only after production backend authorization testing.

Important:
Source trackers are never written by these scripts. Firebase Hosting remains hosting-only and free-tier compatible.
