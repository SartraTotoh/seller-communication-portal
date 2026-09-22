# Design.md · Seller Portals Design System

Release-referenced design decisions for the **Seller Communication Portal** (comm) and **Seller Education Portal** (edu). Scope: layout, container model, typography scale, semantic states, form/request UX, and navigation grouping.

---

## 1. Container & Layout Model (both portals)

**Goal:** consistent capped content width with uniform right-edge clearance across every menu; no uneven stretching to the screen edge. (Revised from the earlier full-bleed 1920px experiment — user feedback: menus stretched unevenly to the right edge.)

| Portal | File | Change |
|---|---|---|
| comm | `app/public/index.html` | landing `header/main/footer` `max-w-7xl mx-auto` (login width) |
| comm | `app/public/index.html` | `--page-max:1920px` → `1680px` (line ~510) |
| comm | `app/public/index.html` | `.page-header p` `max-width:760px` (restored, line ~525) |
| comm | `app/public/index.html` | responsive `.page-header h1 {29px}` scale retained |
| edu | `public/app.css` | full-bleed shell retained |

Result: portal interior is capped at 1680px so body/heading align consistently and never touch the right screen edge on wide monitors.

---

## 1b. Login Skeleton (both portals, unified)

Shared login page structure — same proportions, per-portal content:

- Sticky header: brand + wordmark | center links | language + help + profile (comm) / brand + lang (edu)
- Main split grid (12 cols): **left col-span-5** identity/hero + value pillars + sign-in card · **right col-span-7** feature panel (comm: Comms Asset & Priority Advisor; edu: education showcase) + system status strip
- Footer: verified-session strip + legal links

Comm login: dark "Liquid Enterprise" style — tokens copied from edu design system `app/docs/DESIGN-LiquidEnterprise.md`, applied in comm dark tones. Edu login: light, larger fonts, education graphics, mirrored skeleton.

---

## 2. Typography Scale (Passport standard)

Fonts: **Inter** (UI) + **Noto Sans Thai** (TH) + JetBrains Mono (mono numerics). Icon font stays Material Symbols (Rounded/Outlined), never scaled by UI rules.

| Token | Size | Weight / Detail |
|---|---|---|
| body / `.app` | 15px | line-height 1.52, `-0.012em` |
| top nav / sidebar links | 13.5px | Semi-bold (600) |
| H1 / page title | 32px | 750, `-0.035em` |
| H2 / section title | 23px | 720, `-0.027em` |
| H3 / card title | 17px | 700, `-0.018em` |
| KPI / metric value | 29px | 760, `-0.04em` |
| KPI label / eyebrow | 12.5px | 700, `+0.015em` |
| table row | 13.5px | `thead/th` 12.5px 700 |
| form input / button | 14px | labels 12.5px 650 |
| badge / pill / status | 12px | 650 |

Responsive:
- `≤1366px`: scale down (15→14.5, nav 13, H1 30, H2 22, H3 16.5, KPI 27)
- `≤900px`: 14 / 12.5 / 27 / 20 / 16 / 25

Implementation files:
- comm: new `app/public/css/sellercomm-passport-typography.css` (linked after main `<style>`, line ~1760)
- edu: `public/css/selleredu-passport-typography.css` (already present, kept)

---

## 3. Semantic Colors & Status States

Status pill mapping via `statusClass(status)` (comm, line ~2984):

| Semantic state | CSS class | Covers |
|---|---|---|
| green | `pill green` | published / completed / approved |
| amber | `pill amber` | pending / review / information |
| purple | `pill purple` | production |
| blue | `pill blue` | scheduled |
| red | `pill red` | reject / cancel |
| gray | `pill gray` | draft |
| orange | `pill orange` | fallback |

Priority mapping `priorityClass`: P0 red · P1 amber · P2 blue · else gray.
Role pills: ADMIN red · COMMS blue · REVIEWER purple · else gray.

Status dots: `.status-dot` / `.dot` (green/amber/purple/blue) used in heat/availability views with Material icon companions where an action is implied.

---

## 4. Request Form UX — Dynamic Communication Request (comm)

Rebuilt `openNewRequestModal` (line ~5136). Section order (step boxes removed):

1. **Communication Date** — startDate, time window, endDate
2. **Requested Communication** — channel picker (SC / PN / EDM / Social Media / Seller Education Hub) + channel-specific dynamic fields
3. **Asset (Dynamic)** — `requestAssetSelect` populates from selected channels; social media channels render as `Logo "Facebook"` style sample labels
4. **Request Contact** — Department, Team/Sub Team, Requester, Campaign Name
5. **Content** — Objective Type, Objective/Business Context, Compliance, Monetary, Key Message, Destination Link, Artwork
6. **Audience** — Seller Scope, Target File/Link, Target Criteria

Behavior:
- `syncDynamicRequestForm` re-renders the asset select, toggles seller-scope/target-file visibility, and rebuilds channel-dynamic field blocks on every change
- `submitRequestForm` persists `sourceAssetType` (from the dynamic select) plus derived `assetType = channels.join(', ')`; artwork rules enforce upload by asset
- `.request-wizard{gap:24px}` section grouping; `.form-actions` sticky at bottom of the workbench modal (blur gradient backdrop)

---

## 5. Sidebar Navigation Grouping (comm)

Three sections (labels changed from OPERATIONS/ADMINISTRATION):

- **WORKSPACE** — Dashboard, Requests, Campaign 360, Calendar Comms, Performance
- **INTELLIGENCE** — Comms Command Center, Campaign Grading, Content Hub, Smart Links, Content Operations, API Center
- **SETTINGS** — Portal Settings

`data-nav-group` keys unchanged to preserve JS visibility toggling (line ~3203).

---

## 6. Reference

- UX strategy skill: `seller education portal/docs/professional-uxui-designer.md`
- edu typography manifest: `public/css/selleredu-passport-typography.css`
- comm typography manifest: `app/public/css/sellercomm-passport-typography.css`
- Liquid Enterprise design system (copied from edu, comm tones applied on login): `app/docs/DESIGN-LiquidEnterprise.md`
- Ambient system (day/night + Thai festivals + hover/click + page transitions): `app/public/index.html` `#portal-liquid-theme` style + trailing ambient script