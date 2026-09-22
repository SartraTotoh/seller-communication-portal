SELLER COMMUNICATION PORTAL v4.9.3 - SMART LINK SAFE RECOVERY

PRIMARY GOAL
Make Smart Link shortening return a real production short URL while preserving every existing Tracking Link / UTM record.

ONE CLICK DEPLOY
1. Extract ZIP to a new folder.
2. Double-click START.bat at the package root.
3. Wait for [DONE] Seller Communication Portal v4.9.3 auto deploy completed.
4. Open https://seller-communication-portal.web.app/#links

ONE-TIME TINYURL CONNECTION (ONLY IF STATUS SAYS TOKEN REQUIRED)
1. Smart Links -> Connect TinyURL
2. Paste a TinyURL Free API token with Create TinyURL permission.
3. Click Save, Test & Repair Existing.

DATA SAFETY
- No Tracking_Links row is deleted.
- No Short_Link_Routes row is deleted.
- Existing generated_url and original_url are not rebuilt during repair.
- Existing UTM fields are not rewritten during repair.
- tracking_id and created_at are not changed during repair.
- Only missing short_url is filled; incomplete status may be moved to ACTIVE; updated_at is refreshed.
- Existing v4.9.2 package remains untouched for rollback.

FILES / PATHS
- One-click launcher: START.bat
- Main deploy script: app\AUTO-DEPLOY.ps1
- Smart Link backend: app\backend\PortalApi.gs
- Embedded RPC / schema: app\backend\Closeout.gs
- Smart Link frontend: app\public\index.html
- TinyURL setup note: app\TINYURL-FREE-SETUP.txt
- Validator: app\tools\validate-v4.9.3.mjs
- Smart Link behavior test: app\tools\test-smartlink-v4.9.3.mjs
