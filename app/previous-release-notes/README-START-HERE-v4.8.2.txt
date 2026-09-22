SELLER COMMUNICATION PORTAL v4.8.2
SAFETY GATE CLOSEOUT FIX + TRIPLE SOURCE + CAMPAIGN 360

USE THIS PACKAGE ONLY
1. Close the failed v4.8.1 command window.
2. Extract this ZIP to a NEW folder. Do not merge with v4.8.1 or older.
3. Double-click: ONE-CLICK-AUTO-DEPLOY.cmd
4. At [1/10] Safety gate, confirm validation passes instead of stopping on Closeout.gs.

WHAT v4.8.2 FIXES
- v4.8.1 contained backend/Closeout.gs, but AUTO-DEPLOY.ps1 accidentally checked its release marker against 4.8.0.
- v4.8.2 checks the current closeout release 4.8.2 and has a regression test for this exact mismatch.

PRESERVED FROM v4.8.1
- PN + SCA + Social Media read-only source sync.
- Campaign 360 cross-source grouping and source request IDs.
- SCA Asset Approval evidence: validation, manager decision and FINALIST allocation remain separate.
- Social status mapping.
- Beginner Guidance.
- Firebase hard lock: seller-communication-portal only.
- education-portal-506713 remains blocked.
- Apps Script DOMAIN + USER_ACCESSING.

EXPECTED SUCCESS
- Safety gate completes.
- Validator reports 236/236 PASS.
- Apps Script setup page shows Backend release: v4.8.2.
- PN checkpoint: OK.
- SCA checkpoint: OK.
- Social checkpoint: OK.
- Command window ends with [DONE] Seller Communication Portal v4.8.2 auto deploy completed.

LOCAL VALIDATION
node tools/validate-v4.8.2.mjs
Expected: Seller Communication Portal v4.8.2 validation: 236/236 PASS
