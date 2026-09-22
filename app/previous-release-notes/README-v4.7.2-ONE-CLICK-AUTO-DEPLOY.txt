Seller Communication Portal v4.7.2 - One Click Auto Deploy

Purpose
- Fix v4.7.1 owner resolution when clasp list does not enumerate the Apps Script project that owns the existing /exec URL.

Windows usage
1. Extract this ZIP.
2. Double-click ONE-CLICK-AUTO-DEPLOY.cmd.
3. If Google/Firebase opens a browser authorization page, approve the corporate account once.
4. No Cloud Shell, terminal commands, Script ID copy/paste, or OAuth callback copy/paste is required.

Resolver behavior
- Keeps the existing /exec deployment ID as the hard source of truth.
- Reads local/history .clasp.json candidates.
- Expands candidates with Google Drive API metadata across My Drive + Shared Drives.
- Uses Apps Script Deployments API to match the exact existing deployment ID.
- Never creates a replacement Apps Script project when the existing backend owner cannot be proved.

Safety
- Firebase project hard-locked to seller-communication-portal / 795035951703.
- education-portal-506713 is blocked.
- Firebase scope is Hosting only.
- Existing Apps Script deployment ID is updated in place.
- Persistent resolver state is stored under LOCALAPPDATA/SellerCommunicationPortal only after a proven match.
