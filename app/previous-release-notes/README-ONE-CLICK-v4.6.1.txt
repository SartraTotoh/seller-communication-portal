SELLER COMMUNICATION PORTAL v4.6.1 - ONE-CLICK SAFE REPAIR
===========================================================
Baseline UI/data logic: v4.6.0 Pro People + Mass Upload
This package changes the deployment/setup flow, not the Portal business rules.

FIXES INCLUDED
1) Project lock: only seller-communication-portal / project number 795035951703 can deploy.
2) Hosting-only guard: refuses Functions / Firestore / Storage deployment from this package.
3) Firebase re-auth auto-resume: login happens inside the flow; no need to rerun the script manually.
4) Apps Script auth auto-resume.
5) Reuse-first Apps Script binding: exact title match is reused instead of silently creating duplicates.
6) Deployment-ID preservation: if the Portal already points at a deployment owned by the matched script, that deployment is updated in place.
7) Fail-closed mismatch handling: if the embedded backend deployment and Apps Script project do not match, the script stops instead of replacing the live URL.
8) Preflight validates frontend version, PeopleSeed backend, canonical People import CSV, Firebase target, and public seed leakage.
9) Final setup URL opens automatically where the OS permits.
10) Windows double-click entry point included.

WINDOWS
- Extract ZIP to a normal folder.
- Double-click ONE-CLICK-WINDOWS.cmd
- Complete Google/Firebase sign-in if prompted.
- The flow continues automatically.

CLOUD SHELL
- unzip the ZIP
- cd seller-comms-v4.6.1-one-click-safe-repair
- bash START-HERE.sh

IMPORTANT
Google account authorization cannot be bypassed safely. The flow can open/continue through it, but you may still need to approve the corporate Google consent screen once.

PRODUCTION URL
https://seller-communication-portal.web.app
