SELLER COMMUNICATION PORTAL v4.8.3
RELEASE LOCK FIX + TRIPLE SOURCE + CAMPAIGN 360

USE THIS PACKAGE ONLY
1. Close the failed v4.8.2 command window.
2. Extract this ZIP to a NEW folder. Do not merge with v4.8.2 or older.
3. Double-click: ONE-CLICK-AUTO-DEPLOY.cmd
4. At [1/10] Safety gate, confirm validation passes.

WHAT v4.8.3 FIXES
- v4.8.2 public/index.html correctly declared Portal 4.8.2.
- AUTO-DEPLOY.ps1 accidentally still searched for data-portal-version="4.8.1" while reporting "Portal version is not 4.8.2".
- This caused a guaranteed false STOP at the Portal version safety gate.
- v4.8.3 replaces scattered deployer release literals with ONE release constant: $Release = '4.8.3'.
- Portal, Closeout, backend, Live Sync, Apps Script source attestation, setup URL and Production verification all derive from that release lock.
- The validator fails if 4.8.1 or 4.8.2 remains in release-critical runtime files.

PRESERVED
- PN + SCA + Social Media read-only source sync.
- Campaign 360 cross-source grouping.
- SCA Asset Approval evidence and conflict handling.
- Social status mapping.
- Beginner Guidance.
- Firebase hard lock: seller-communication-portal only.
- education-portal-506713 remains blocked.
- Apps Script DOMAIN + USER_ACCESSING.

EXPECTED SUCCESS
- Header: Seller Communication Portal v4.8.3.
- Validator: 245/245 PASS.
- [1/10] Safety gate passes Portal/Closeout/Backend/Live Sync release checks.
- Apps Script setup page shows Backend release: v4.8.3.
- PN checkpoint = OK.
- SCA checkpoint = OK.
- Social checkpoint = OK.
- Command window ends with [DONE] Seller Communication Portal v4.8.3 auto deploy completed.

LOCAL VALIDATION
node tools/validate-v4.8.3.mjs
Expected: Seller Communication Portal v4.8.3 validation: 245/245 PASS
