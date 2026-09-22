SELLER COMMUNICATION PORTAL v4.7.6
DOMAIN POLICY FIX - START HERE

WHAT TO DO
1. Extract this ZIP to a normal local folder.
2. Double-click ONE-CLICK-AUTO-DEPLOY.cmd.
3. If Google/Firebase asks you to sign in, use the company account that already has edit/deploy access to this Seller Communication Portal project.
4. Do not change Domain Admin settings and do not enable ANYONE access.

WHAT THE ONE-CLICK DOES
- Locks Firebase to seller-communication-portal only.
- Pushes the backend to the existing Apps Script project.
- Confirms Google's remote manifest is DOMAIN + USER_ACCESSING.
- Tries to update the existing Web App deployment in place.
- If the old deployment is a legacy ANYONE deployment blocked by company policy, it automatically creates a DOMAIN replacement, keeps the old deployment for rollback, rebinds the frontend, and continues.
- Initializes People + PN + SC recovery.
- Deploys Firebase Hosting only.
- Verifies Production serves Portal v4.7.6 before marking complete.

SUCCESS END STATE
The terminal ends with:
[DONE] Seller Communication Portal v4.7.6 auto deploy completed.

Then open Portal Settings > System and confirm Production Health is READY.
