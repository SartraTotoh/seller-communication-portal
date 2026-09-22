# Seller Communication Portal — สรุปสำหรับทำงานต่อ

บันทึก ณ 13-09-2026 (Asia/Bangkok) • รวม handover 11-09-2026 และบทสนทนาล่าสุดเรื่อง Admin/Mode

## 1. ภาพรวมและสถานะ

Seller Comms รับงานสื่อสารเพื่อ review, scheduling, บันทึกการเผยแพร่ และวัดผลช่องทาง มี Smart Links/UTM และเชื่อม Selleredu กับ THSP

| รายการ | หลักฐานและสถานะ |
|---|---|
| URL ใน handover/งานล่าสุด | https://seller-communication-portal.web.app/ |
| URL ที่เคยขอ deploy | https://seller-communication.web.app/ เป็นคนละชื่อ site; งาน 12-09 เคยพบ Site Not Found ที่ URL นี้ |
| Package | v4.9.3R4.4 Top Level Login Handoff DataSafe |
| Frontend marker | 4.9.3 ตาม package; ต้องเทียบ live release |
| Static validation | handover รายงาน validator R4.4 ผ่าน |
| Production acceptance | ยังไม่มีหลักฐานครบทั้ง login, roles, links, workflow, integration และ rollback |

งานนี้รวบรวมสถานะจากหลักฐานที่อ่าน ไม่ได้ deploy หรือทดสอบ production ใหม่ การเปิดหน้าเว็บได้ไม่เท่ากับผ่าน acceptance ทั้งระบบ

## 2. ข้อกำหนดเจ้าของและ Mode ล่าสุด

ผู้ใช้ระบุ totoh.taponchai@shopee.com และ sellereducation.th@shopee.com เป็นเจ้าของที่มีสิทธิ์เท่ากัน งาน follow-up มีการยืนยันคำขอให้สองบัญชีเป็น ADMIN และลด ADMIN อื่นเป็น COMMS

| ประเด็น | สถานะที่สรุปได้ |
|---|---|
| Migration สิทธิ์ทั้งหมด | งาน follow-up รายงานว่ายังไม่มีหลักฐานว่าเปลี่ยน production สำเร็จ มีไฟล์/แนวทางเตรียมไว้และติด authentication |
| Login บัญชี sellereducation.th@shopee.com | คำตอบล่าสุดในงาน follow-up รายงานว่าเข้าเป็น ADMIN ได้ |
| ตัวเลือก Mode | คำตอบล่าสุดรายงานว่าพบ ADMIN, COMMS, REVIEWER, REQUESTER |
| ข้อกำหนดผู้ใช้ล่าสุด | ผู้มี ADMIN ต้องสลับไป Admin, Comms หรือ Reviewer ได้เมื่อเริ่มใช้ |
| สิ่งยังต้องตรวจ | สลับจริงทุกโหมด, ความถูกต้องหลัง refresh/login ใหม่, สิทธิ์ backend, บัญชี totoh และรายชื่อ ADMIN ทั้งหมดหลัง migration |

หลักฐานข้างต้นเป็นรายงานจากงานก่อนหน้า ไม่ใช่ผลทดสอบซ้ำในงานนี้ การพบ Mode selector ไม่ได้พิสูจน์ว่า migration สิทธิ์ทั้งระบบเสร็จ ต้องแยก actual role จากโหมดมุมมองและตรวจสิทธิ์ทุกคำสั่ง privileged ฝั่ง server

## 3. Login และ session ตาม R4.4

Firebase → Workspace auth bridge → อ่าน corporate email/allowlist → ออก HMAC token → กด Continue แบบ target=_top → กลับ Firebase ผ่าน URL fragment → เก็บใน sessionStorage และล้าง fragment → backend ตรวจ signature/audience/lifetime/email และ resolve role

| ส่วนประกอบ | Deployment model ตาม package |
|---|---|
| Auth bridge | DOMAIN + USER_ACCESSING; scope userinfo.email |
| Central backend | DOMAIN + USER_DEPLOYING; ใช้ Sheets/Drive/triggers/external requests/mail/email |
| Allowed domains | @shopee.com และ @shopeemobile-external.com |
| Session | token อายุ 8 ชั่วโมง; ต้องตรวจ expiry/refresh/tab closure/sign-out/revocation |

@external.shopee.com เป็น domain ใน THSP ไม่ใช่ domain ที่ R4.4 นี้ยืนยันรองรับ ส่วน allowlist ใน code ไม่พิสูจน์ว่าผ่าน Google Workspace organization gate ได้ ห้ามนำ token/HMAC secret ใส่รายงานหรือ frontend

## 4. เมนูและ workflow

Source inventory มี 12 เมนู แต่ role visibility จริงยังต้องทดสอบ:

| กลุ่ม | เมนู |
|---|---|
| Workspace | Dashboard, Requests, Campaign 360, Calendar Comms, Performance |
| Operations | Comms Command Center, Campaign Grading, Content Hub, Smart Links, Content Operations, API Center |
| Administration | Portal Settings |

Content Operations: DRAFT → READY_FOR_REVIEW → READY_TO_SCHEDULE → SCHEDULED → PUBLISHED

- แก้เนื้อหาแล้วต้องล้าง approval/schedule เดิม; reject stale revision
- Scheduling ตรวจ conflict ภายใน 30 นาทีของ channel/account เดียวกัน
- Published ต้องมี HTTPS post URL จริงและ publication time ที่ถูกต้อง เป็นการบันทึกหลักฐาน ไม่ใช่หลักฐานว่ามี automatic social posting
- Metrics: reach, impressions, engagements, clicks, videoViews พร้อม periodStart/End, distribution, evidenceUrl; แยก missing จาก zero และไม่บวก snapshot ซ้ำ

| Role ตาม ContentOperations.gs ที่ handover ตรวจ | หน้าที่ |
|---|---|
| REQUESTER | สร้าง/แก้งานตนเอง และอ่านงานที่ตนเป็นเจ้าของหรือผู้สร้าง |
| COMMS | อ่าน/แก้เนื้อหา จัดตาราง บันทึกเผยแพร่และ metrics |
| REVIEWER | อ่าน/อนุมัติ; ไม่อยู่ใน save permission list |
| ADMIN | core actions และ revision restore ภายใต้ state checks |

## 5. Smart Links และข้อมูล

ปัญหาที่รายงาน: สร้าง UTM ได้แต่ย่อลิงก์ไม่ได้ Changelog v4.9.3 ระบุ TinyURL authenticated creation, transient retry, duplicate custom-alias fallback และ backfill ลิงก์ไม่สมบูรณ์ แต่ยังต้องพิสูจน์ด้วย live redirects

- ห้าม reset Tracking_Links และ Short_Link_Routes
- รักษา tracking_id, original_url, generated_url, UTM, creation metadata และความสัมพันธ์ route/destination
- Backfill ตาม changelog แก้เฉพาะ short_url, updated_at, status ของรายการไม่สมบูรณ์
- TinyURL token อยู่ Script Properties; ไม่ใส่ export/หน้าเว็บ
- ทดสอบ auto alias, custom alias, duplicate alias fallback, full UTM redirect และ persistence หลัง refresh พร้อม before/after snapshot

## 6. การเชื่อมต่อและ ownership

Selleredu เป็นเจ้าของ task/completion/assets; Seller Comms เป็นเจ้าของ revision/approval/schedule/publication evidence/metrics; THSP read-only aggregation โดย Trainer ยังเป็นแหล่งสำคัญ

มี adapter ใน package แต่ไม่ใช่หลักฐานว่าติดตั้งใน source projects แล้ว ต้องปรับ assumptions ของ integration v4.9.0 ให้ตรง R4.4 signed session/endpoints/audience และทดสอบ dedup ด้วย taskId/channel/account; fetch ล้มเหลวต้องคง snapshot ที่สำเร็จล่าสุดและแจ้ง error ไม่แปลงเป็น empty success

Runtime ที่ handover ตรวจคือ Firebase frontend + Apps Script + Google Sheets รวม Content_Operations_Journal ยังต่างจากเป้าหมายเดิมที่ไม่ใช้ Sheets เป็นฐานหลัก การย้ายฐานข้อมูลเป็นขอบเขตแยก

## 7. Source map และหลักฐานงานที่เตรียมไว้

Package root: Seller-Comms-Portal-v4.9.3R4.4-TopLevel-Login-Handoff-DataSafe

| Path ภายใน package | หน้าที่ |
|---|---|
| START.bat | validate แล้วรัน recovery |
| app/tools/validate-r4.4.mjs | static checks |
| app/tools/r44-workspace-login-recovery.mjs | recovery/Hosting |
| app/tools/ensure-auth-bridge-r44.mjs | auth bridge deployment |
| app/tools/update-apps-script-deployment.mjs | Apps Script deployment |
| app/auth-bridge/Code.gs | identity/session/Continue |
| app/backend/AuthSession.gs | signed-session verification |
| app/backend/TrackerSync.gs | read gateway |
| app/backend/PortalApi.gs | writes/Smart Links/People roles |
| app/backend/Closeout.gs | viewer identity |
| app/backend/ContentOperations.gs | journal/revisions/approval/schedule/metrics |
| app/public/index.html | frontend/token/menu/version |
| app/integration/selleredu-content-bridge.js | source task/metrics adapter |
| app/integration/thsp-content-bridge.js | read-only feed |

พบไฟล์ migration ใน C:\Users\totoh.taponchai\Documents\Codex\2026-09-12\new-chat-2\work ได้แก่ prepare-seller-comms-role-migration.mjs, run-seller-comms-role-migration.mjs, prepare-seller-comms-firebase-migration.mjs และโฟลเดอร์ seller-comms-role-migration ที่มี backend/firebase และ recovery snapshots การมีไฟล์เหล่านี้ไม่ยืนยันว่า production migration เสร็จ

Log หนึ่งบันทึก PowerShell positional argument error ที่คำว่า Comms; เป็นหลักฐานความล้มเหลวของ attempt หนึ่ง ไม่ใช่ข้อสรุปทุก attempt

## 8. UI / ค่าใช้จ่าย / rollback

UI requirement: Inter + Noto Sans Thai fallback; body 15px, menu 13.5px semibold, H1 32px, H2 23px, cards 17px, KPI 29px, tables 13.5px, forms/buttons 14px ยังไม่ใช่ผล CSS audit

ใช้ corporate resources ไม่ใช้ personal billing; Gemini ภายใต้ Workspace โดยไม่เพิ่ม AI cost และ cost warning USD 1 เป็นข้อกำหนดที่ยังไม่ยืนยันการตั้งค่าจริง

Rollback ต้องเป็น frontend + auth bridge + backend ที่ทดสอบเข้าชุดกัน ไม่ถือว่า R4.3 ปลอดภัยเพราะเป็นรุ่นก่อนหน้า ห้าม reset ฐานข้อมูลเพื่อกู้ login

## 9. งานค้างและเกณฑ์ปิด Portal

- [ ] P0 ยืนยัน canonical URL, Hosting site, live release, endpoints และ deployment modes
- [ ] P0 ตรวจสองเจ้าของและรายชื่อ ADMIN ทั้งหมด; บันทึกผล migration/audit ให้ชัด
- [ ] P0 Admin สลับ ADMIN/COMMS/REVIEWER ได้จริง และกลับมาได้ตามสิทธิ์
- [ ] P0 Login บัญชีที่รองรับจริง; Continue กลับ top-level Firebase; fragment ถูกล้าง
- [ ] P0 backend ปฏิเสธ identity/token ไม่ถูกต้องหรือหมดอายุ; refresh ไม่ต่อ expiry
- [ ] P0 Smart Links ทุก alias/redirect/persistence ผ่านและข้อมูลเดิมคงอยู่
- [ ] P0 ระบุ snapshot และ rollback ที่ทดสอบแล้ว
- [ ] P1 ทดสอบ menu/direct route/API ตามทุก role รวม revocation
- [ ] P1 review/revision/schedule conflict/publish evidence/metrics ผ่านครบ
- [ ] P1 ติดตั้งและทดสอบ Selleredu/THSP adapters กับ auth ปัจจุบัน
- [ ] P1 sync/feedback ซ้ำไม่สร้างซ้ำ และ audience restriction/Trainer ownership คงอยู่
- [ ] ระบุผู้ตรวจและหลักฐานก่อนรับ production; แยก database migration เป็นงานถัดไป

## 10. แหล่งอ้างอิง

Seller_Comms_Implementation_Handover_v4.9.3R4.4.docx และ Seller_Comms_Change_Summary_v4.9.3R4.4.docx; ข้อความสกัดจากงานเดิมแนบท้ายไฟล์

งาน “Deploy 3 Firebase projects” (01a095f8-492c-79f3-ba95-bd363eb1adc1), “ทำให้ Deploy 100% ฝาก Live Acceptive ให้หมด ห้ามไม่ทำ ห้ามป…” (01a09607-9752-7d40-bfc0-cd96dcb12cd4; บาง turn ไม่มีรายละเอียดให้ตรวจ) และ “Follow up conversation” (01a09735-9103-7690-9996-f8621fe81178; แหล่งล่าสุดเรื่อง role/Mode)


---

## ภาคผนวก: ข้อความเอกสารส่งมอบที่เก็บจากงานเดิม

ส่วนนี้เก็บข้อความสกัดเพื่ออ้างอิงรายละเอียดทั้งหมด รวมตารางในรูปข้อความ ไม่ใช่สำเนาการจัดหน้าของ DOCX และไม่ใช่สถานะ live ใหม่ ให้ใช้บทสรุปด้านบนสำหรับสถานะล่าสุดที่ทราบ


### แหล่ง: Seller_Comms_Change_Summary_v4.9.3R4.4.txt

SHA-256 ของข้อความสกัด: 5D78FC2BC0110BC01C414EF92575554E93EC1533C547549340F39A2378A77ACF

~~~~text
# Seller_Comms_Change_Summary_v4.9.3R4.4.docx

SELLER COMMUNICATION PORTAL
Project Change Summary
Release package v4.9.3R4.4  •  Frontend v4.9.3  •  11-09-2026
This summary hands over the latest inspected Seller Communication Portal package, covering Workspace login, Smart Links and three-portal integration. R4.4 passes its local static validator; production acceptance remains unverified.
Executive decision
Preserve existing links and business records. Verify corporate login and real short-link redirects before accepting the release. This document does not deploy code, repair records or declare the live portal complete.
Non negotiable safeguards
Never reset Tracking_Links or Short_Link_Routes to fix login or deployment.
Preserve Tracking ID, destination, generated URL, UTM values and creation metadata during link repair.
Do not copy THSP domains, roles or rollback versions into Seller Communication.
Retain a verified working deployment before cutover. R4.3 is not automatically a safe rollback just because it precedes R4.4.
Scope: seller-communication-portal.web.app only. The two supplied THSP documents are structure references, not configuration sources.
1 Current state and target behavior
2 Authentication contract
Packaged manifests specify DOMAIN + USER_ACCESSING for the email-only auth bridge and DOMAIN + USER_DEPLOYING for the central data backend. Confirm live deployment settings before acceptance.
R4.4 code allows @shopee.com and @shopeemobile-external.com. It does not allow the @external.shopee.com domain shown in the THSP reference. Code allowlisting does not prove that an account can pass the Google Workspace organization gate.
3 Architecture boundary
The inspected package uses Firebase for the frontend and Apps Script with Google Sheets for data, including Content_Operations_Journal. It therefore still differs from the earlier goal of avoiding Sheets as the primary runtime. Database migration is separate work, not part of this handover.
4 Live acceptance checklist
Pending — Login with an approved account; confirm real email and role rather than a generic Workspace User label.
Pending — Confirm the address bar returns to seller-communication-portal.web.app and the session fragment is removed.
Pending — Reject unauthorized identities and invalid or expired tokens on protected reads and writes.
Pending — Connect TinyURL using an authorized account; keep the token out of frontend code and shared reports.
Pending — Repair existing links without changing IDs, UTM values, generated URLs or creation metadata.
Pending — Test auto alias, available custom alias and duplicate alias fallback using real redirects.
Pending — Refresh and verify all existing records and newly saved links persist. Compare before and after snapshots.
Pending — Approve the current content revision before scheduling; record a real post URL and publication time before metrics.
Pending — Repeat integration sync without duplicates and preserve Trainer records in THSP.
5 Evidence and status
Reviewed package: Seller-Comms-Portal-v4.9.3R4.4-TopLevel-Login-Handoff-DataSafe.zip. Sources include README-R4.4.txt, manifests, AuthSession.gs, auth bridge code, ContentOperations.gs and app/integration/INTEGRATION.md.
app/tools/validate-r4.4.mjs was executed successfully during this handover. This is a static package check, not a production or penetration test. No deployment, live account test, TinyURL call or data repair was performed.
See the companion Implementation Handover for exact package paths, roles, ownership, release checks and rollback conditions.

## Table 1
Current evidence | Required outcome
R4.4 local validator passes | A real authorized account returns to Firebase with the correct identity and role.
User reported working UTM creation but broken shortening | New and repaired short links resolve to the intended URL with all UTM values intact.
Integration adapters are packaged | Adapters are installed and tested against both upstream and downstream portal APIs.

## Table 2
Area | Package evidence | Live acceptance
Login | Explicit Continue link with target=_top | Portal opens at its Firebase address, outside the Apps Script frame.
Identity | Separate auth bridge and data backend | Actual email and server-authorized role are correct.
Session | HMAC token with an 8-hour lifetime; sessionStorage | Invalid and expired tokens fail; refresh does not extend the same token.
Smart Links | Configure, create and backfill handlers | TinyURL works, repairs persist and redirects retain UTM.
Content Operations | Approval, schedule, evidence and metrics | Published means recorded evidence, not proven automatic social posting.
Integration | Seller Edu and THSP adapters | Install and test adapters with the current signed-session contract.

~~~~


### แหล่ง: Seller_Comms_Implementation_Handover_v4.9.3R4.4.txt

SHA-256 ของข้อความสกัด: B41C0DC01A04528382C22A6AF8DC0758671B7C99A8459FB501A619D38B0A900B

~~~~text
# Seller_Comms_Implementation_Handover_v4.9.3R4.4.docx

SELLER COMMUNICATION PORTAL
Workspace Login and Smart Links
Implementation Handover
Release package v4.9.3R4.4  •  Frontend v4.9.3  •  11-09-2026
Technical handover for the receiving developer and portal administrator. This document explains the inspected package, the files to review and the evidence required before production acceptance.
1 Executive decision
Continue from R4.4 while preserving existing Smart Links and source data. Close login and real short-link acceptance before expanding features. A source validator cannot establish live Google permissions or successful TinyURL behavior.
Scope and evidence boundary
No code or production data was changed. No deployment was executed. Seller Education and THSP remain separate projects. Completion percentages are not estimated without test evidence.
Correction to the earlier file search response: README and validation documents exist inside the ZIP. Their absence as standalone files did not mean the package lacked supporting documentation.
2 Authentication flow
Auth bridge scope: userinfo.email only. Central backend scopes include Sheets, Drive, triggers, external requests, mail and email. Keep these execution models distinct.
Code allowlist: @shopee.com and @shopeemobile-external.com. Test both using real accounts. Support for @external.shopee.com is not established by this package.
Tokens are issued for eight hours. Test expiration, refresh, tab closure, sign-out and role revocation. Never expose HMAC secrets or tokens in shared logs.
Integration documentation from v4.9.0 still describes the older Workspace access pattern. Reconcile its endpoint and session assumptions with R4.4 before activating adapters.
3 Exact file map
All paths below are relative to the extracted package root:
Seller-Comms-Portal-v4.9.3R4.4-TopLevel-Login-Handoff-DataSafe
Also verify app/firebase.json and both appsscript.json manifests against the live project. Record resolved endpoints and deployment IDs in a controlled handover log; do not guess them.
4 Smart Links and data safety
The reported defect was working UTM creation with failed shortening. The v4.9.3 changelog describes authenticated TinyURL creation, transient retries, duplicate custom-alias fallback and repair of incomplete existing links. These behaviors still need live verification.
5 Content Operations permissions
Workflow: DRAFT → READY_FOR_REVIEW → READY_TO_SCHEDULE → SCHEDULED → PUBLISHED. Editing clears the previous approval and schedule; stale revision requests are rejected.
Scheduling checks conflicts within 30 minutes on the same channel/account. Publishing requires a real HTTPS post URL and valid publication time. This is evidence recording, not proof of an automatic social publishing integration.
6 Portal inventory and measurement
The frontend contains 12 primary menu buttons. This is a source inventory, not a verified role-by-role visibility matrix or a statement that all functions passed live tests.
Content Operations metrics include reach, impressions, engagements, clicks and videoViews, with periodStart, periodEnd, distribution and evidenceUrl. Missing values must remain distinguishable from zero. Do not add repeated snapshots to previous totals.
7 Three portal ownership
Adapters are packaged but not automatically installed in the other portals. Map durable APIs, endpoints, signed sessions and audience permissions first. Failed fetches retain the last successful snapshot; failure is not an empty successful feed.
UI and operating constraints
Requested UI baseline: Inter with Noto Sans Thai fallback; body 15px; menu 13.5px semibold; H1 32px; H2 23px; cards 17px; KPI 29px; tables 13.5px; forms/buttons 14px. This is a requirement baseline, not a full CSS audit.
Existing constraints: no personal billing details; Gemini within Workspace without added AI cost; cost warning at 1 USD. Billing-alert configuration and AI integration were not verified in this review.
8 Cutover and live acceptance
For a later authorized deployment, extract into a new folder and retain the previous working package. Run the following entry point only; README and .txt files are documentation, not installers:
Seller-Comms-Portal-v4.9.3R4.4-TopLevel-Login-Handoff-DataSafe/START.bat
9 Rollback and definition of done
Stop cutover if identity, authorization or data checks fail. Capture the stage, time and error without secrets. Restore only a tested compatible frontend, auth bridge and backend set; do not reset the database to recover login.
Accept production only after the applicable checks have named reviewers and evidence, including before/after data comparisons. Deployment, Smart Links and integration owners must be assigned. No owner acceptance or confirmed completion date is recorded here.
10 Evidence register and remaining work
Outstanding work in priority order
P0 — Verify live R4.4 login and read/write authorization using real corporate accounts.
P0 — Record a protected snapshot and complete Smart Links redirect and persistence acceptance.
P0 — Identify and test a compatible rollback deployment without resetting business data.
P1 — Reconcile older integration session assumptions with R4.4 and install adapters in the actual source projects.
P1 — Run per-role visibility and end-to-end content workflow tests.
Separate scope — Decide how to close the gap between the current Sheets-backed runtime and the earlier database architecture goal.
Reference documents: THSP_Authentication_Change_Summary_v7.1.5.0.docx and THSP_v7.1.5.0_Workspace_Identity_Authentication_Handover.docx. Used for document structure only; THSP settings and rollback versions were not reused.
Review limitation: no production deployment, account acceptance, TinyURL request, cross-portal sync or billing configuration was performed. The package is inspectable and its static validator passes; operational completion remains pending.

## Table 1
Item | Value
Portal | https://seller-communication-portal.web.app/
Package | v4.9.3R4.4 Top Level Login Handoff DataSafe
Frontend marker | 4.9.3 in index.html and the R4.4 validator
Date | 11-09-2026
Validation | R4.4 local static validator passed in this review
Live status | Not verified in this handover
Rollback | Identify a tested working deployment before cutover

## Table 2
Step | Component | Required behavior
1 | Firebase frontend | Start Workspace login when no session is available.
2 | Auth bridge | Read the active Google email and check the allowlist.
3 | Signed session | Issue HMAC token with email, iat, exp, aud and nonce.
4 | Top level handoff | User clicks Continue; target=_top returns to Firebase using a URL fragment.
5 | Frontend | Store token in sessionStorage and remove the fragment.
6 | Data backend | Validate signature, audience, lifetime and email before protected reads and writes.
7 | Authorization | Resolve the user role on the server. Identity is not an Admin grant.

## Table 3
Manifest path | Access | Execute as
app/auth-bridge/appsscript.json | DOMAIN | USER_ACCESSING
app/backend/appsscript.json | DOMAIN | USER_DEPLOYING

## Table 4
Exact package path | Responsibility
START.bat | Runs local validation, then R4.4 recovery.
app/tools/validate-r4.4.mjs | Static source, manifest and data-safety checks.
app/tools/r44-workspace-login-recovery.mjs | Recovery orchestration and Hosting deployment.
app/tools/ensure-auth-bridge-r44.mjs | Creates or updates the auth bridge deployment.
app/tools/update-apps-script-deployment.mjs | Updates or replaces Apps Script deployments.
app/auth-bridge/Code.gs | Identity, signed session and Continue link.
app/backend/AuthSession.gs | HTTP signed-session verification.
app/backend/TrackerSync.gs | Read gateway session authorization.
app/backend/PortalApi.gs | Write gateway, Smart Links and People roles.
app/backend/Closeout.gs | Viewer identity resolution.
app/backend/ContentOperations.gs | Journal, revisions, approval, schedule and metrics.
app/public/index.html | Frontend, menus, token handling and marker.
app/integration/selleredu-content-bridge.js | Source task adapter and metrics feedback.
app/integration/thsp-content-bridge.js | Read-only downstream feed adapter.

## Table 5
Data | Preservation contract
Tracking_Links | Keep tracking_id, original_url, generated_url, UTM fields and creation metadata.
Backfill | Changelog limits edits to short_url, updated_at and status for incomplete records.
Short_Link_Routes | Do not reset. Verify Tracking ID and destination relationships.
TinyURL token | Keep in Script Properties as documented. Do not include in exports or frontend code.
Source trackers | Do not mutate source records during login recovery.

## Table 6
Code role | Observed behavior in ContentOperations.gs
REQUESTER | Create or edit own content; read records owned or created by the user.
COMMS | Read and edit content; schedule, record publication and metrics.
REVIEWER | Read and approve; not included in the save permission list.
ADMIN | Core actions plus revision restore, subject to state checks.

## Table 7
Group | Menu names
Workspace | Dashboard; Requests; Campaign 360; Calendar Comms; Performance
Operations | Comms Command Center; Campaign Grading; Content Hub; Smart Links; Content Operations; API Center
Administration | Portal Settings

## Table 8
Portal | Source ownership
Seller Education | Source tasks, completion and creative assets. Deduplicate by taskId/channel/account.
Seller Communication | Approval revisions, schedules, publication evidence and metrics.
THSP | Read-only aggregation. Trainer remains its major source; no upstream overwrite.

## Table 9
ID | Acceptance check | Status
A1 | Live modes, endpoints and release marker match the package. | PENDING
A2 | Approved accounts reach the portal with correct email and role. | PENDING
A3 | Continue opens Firebase at top level; fragment is removed. | PENDING
A4 | Unauthorized identity and invalid or expired tokens are denied. | PENDING
A5 | Refresh preserves token expiry; no unintended Admin access. | PENDING
A6 | Auto/custom alias and fallback redirect with full UTM. | PENDING
A7 | Backfill persists without changing existing link identity or data. | PENDING
A8 | Revision, approval and scheduling conflicts are enforced. | PENDING
A9 | Publication evidence precedes metrics with valid periods. | PENDING
A10 | Repeated sync and feedback writes do not duplicate records. | PENDING
A11 | THSP feed preserves audience restrictions and Trainer data. | PENDING
A12 | Working rollback package and deployment are identified. | PENDING

## Table 10
Source path | Use in this handover
README-R4.4.txt | R4.3 iframe issue, explicit Continue fix and safety scope.
VALIDATION-R4.4.txt | Packaged historical static-check report.
app/tools/validate-r4.4.mjs | Executed successfully during this document task.
app/CHANGELOG-v4.9.3.txt | Smart Link repair behavior and preservation limits.
app/PRODUCTION-ACCEPTANCE-v4.9.3.txt | Original Smart Links live acceptance checklist.
app/integration/INTEGRATION.md | Adapter availability, source ownership and integration caveats.
Auth bridge and backend source files | Domains, session verification, roles, workflow and exact paths.

~~~~

