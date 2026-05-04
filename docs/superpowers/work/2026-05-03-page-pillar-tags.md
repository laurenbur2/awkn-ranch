# Page Pillar Tags — Phase 1 Pass 3 deliverable

Running tag of every admin BOS page surveyed during Pass 3 folder-by-folder audit. Input to Phase 6 IA / Pillar-model work.

**Pillar values:** `Ranch` (AWKN Ranch venue), `Within` (Within Center clinical), `Retreat` (AWKN Retreat House), `Venue` (Venue Rental for events), `Cross-cutting` (multi-pillar), `→ Pass 4 wholesale` (delete with Vapi/PAI decommission), `→ Pass 4 surgery` (rip PAI/Vapi guts, keep AWKN parts).

## Chunk 1 — PAI/Vapi cluster (audited 2026-05-03)

| Page | Folder | Pillar / Disposition | Notes |
|---|---|---|---|
| `lifeofpaiadmin.html` | `spaces/admin/` | ✅ Deleted 2026-05-03 | Was a meta-refresh redirect to `/residents/lifeofpaiadmin.html`; target was deleted in Pass 2. Companion `.js` never existed. |
| `ai-admin.html` + `.js` | `spaces/admin/` | → Pass 4 wholesale | "AlpaClaw" admin page (chat gateway / OpenClaw configuration). Dies with PAI. Tab `openclaw` in admin-shell.js, `feature: 'pai'`. |
| `pai-imagery.html` + `.js` | `spaces/admin/` | → Pass 4 wholesale | PAI image-generation viewer. Dies with PAI. |
| `voice.html` + `.js` | `spaces/admin/` | → Pass 4 wholesale | "Concierge" page — Vapi voice management UI. Imports `voice-service.js`. Tab `voice` in admin-shell.js, `feature: 'voice'`. Already on Pass 4 Vapi decommission list. |
| `faq.html` + `.js` | `spaces/admin/` | → Pass 4 surgery | FAQ Management page. Imports `chat-widget.js`, references `voiceAssistant`/`voiceCallStats`. Decision in Pass 4: keep FAQ data (Q&A entries may be AWKN-relevant content) and rip out PAI/Vapi guts, OR wholesale delete if FAQ data is also alpaca residue. |

**Same-commit reference cleanup:**
- `shared/admin-shell.js` — removed `lifeofpai` tab entry + icon
- `shared/associate-shell.js` — removed `admin_pai_settings` from ADMIN_PERMISSION_KEYS
- `shared/resident-shell.js` — removed `admin_pai_settings` from ADMIN_PERMISSION_KEYS, removed broken-link entry pointing to deleted lifeofpaiadmin
- `spaces/admin/users.js` — removed PAI tab entry from user-permissions UI

**Deferred to Pass 4:** all `feature: 'pai'`-gated and `feature: 'voice'`-gated tab entries in `shared/admin-shell.js` (faq, voice, openclaw) — bundled with PAI/Vapi wholesale decommission.

## Chunk 2 — Internal/dev cluster (audited 2026-05-03)

**Outcome: zero deletions.** All 5 pages are AWKN-legitimate or intentionally-preserved per prior developer work (Justin's `0dfd75a4` "Retire DevControl page and pillar" + adjacent retirements).

| Page | Folder | Pillar | Disposition / Notes |
|---|---|---|---|
| `appdev.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. "Claudero AI Developer Console" — submits feature requests to the Feature Builder agent on the DigitalOcean droplet. Tab `appdev` in admin-shell with `feature: '_hidden'`. Audit deferred to the agentic-systems pause (TODO.md cross-cutting item: "audit auto-merge agentic systems before Phase 6"). |
| `testdev.html` | `spaces/admin/` | Cross-cutting | Keep — intentional legacy redirect to `./dashboard.html`. Per `shared/admin-shell.js:126-129`: "Removed from Admin nav per request: Brand, Notifications, Test Dev, DevControl. Their pages now redirect to the dashboard for any cached link. Permission keys (view_devcontrol, view_testdev) intentionally kept in STAFF_PERMISSION_KEYS so existing user/permission rows still validate." Touching would override Justin's deliberate design. |
| `devcontrol.html` | `spaces/admin/` | Cross-cutting | Keep — same deliberate-redirect pattern. See also `shared/admin-shell.js:410-412` for explicit comment. |
| `phyprop.html` + `.js` | `spaces/admin/` | Ranch | Keep. "PhyProp - Physical Property data dashboard" — 527 lines of legitimate AWKN Ranch property data (parcels, edges, structures, utilities, impervious, zoning, renderings, spaces overview). Tab `phyprop` with `feature: '_hidden'`. |
| `manage.html` | `spaces/admin/` | Cross-cutting | Keep — legacy redirect to `./spaces.html` preserving query params. Inline comment: "manage.html has been split into individual pages." Bookmark preservation. |

**No same-commit code changes** — chunk 2 is audit-only.

**Pattern noted:** the recency-of-edits memory caveat applies in reverse here. Justin's substantive retirement comments (`admin-shell.js:126-129, 410-412`) are the deciding signal that these "redirect-only" pages are intentional and should be preserved.

## Chunk 3 — Operations cluster (audited 2026-05-03)

**Outcome: zero deletions.** All 4 pages are mainline AWKN operational pages or intentional legacy redirects.

| Page | Folder | Pillar | Disposition / Notes |
|---|---|---|---|
| `rentals.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 4504 LOC. Real AWKN rental/lodging admin (Within inpatient stays + Ranch lodging + Retreat House). Imports `rental-service`, `email-service`, `sms-service`, `lease-template-service`, `pdf-service`, `signwell-service`. "tenant" appears only as person-name variable, no IoT residue. |
| `spaces.html` | `spaces/admin/` | Cross-cutting | Keep — intentional legacy redirect to `./dashboard.html`. Inline comment: "The old generic spaces admin page was retired. Venue Rental's 'Spaces' tab (venue-spaces.html) is the current resource-calendar view; the team-portal landing is dashboard.html. Send any stale link to the dashboard." Same pattern as testdev/devcontrol/manage. |
| `projects.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 1040 LOC. Task management ("Create, edit, delete, and reassign tasks"). Imports `project-service`, `media-service`. AWKN-relevant for property maintenance, retreat prep, etc. |
| `highlights-order.html` | `spaces/admin/` | Cross-cutting | Keep. 464 LOC, no separate .js (logic inline). Admin tool that reads `media_tag_assignments` filtered by 'highlights' tag and reorders display for consumer-facing pages. |

**No same-commit code changes** — chunk 3 is audit-only.

## Chunk 4 — CRM/sales cluster (audited 2026-05-03)

**Outcome: zero deletions.** All 5 pages are mainline AWKN CRM/sales surfaces. One tech-debt finding flagged for separate cleanup.

| Page | Folder | Pillar | Disposition / Notes |
|---|---|---|---|
| `crm.html` + `.js` | `spaces/admin/` | Cross-cutting (Within / Ranch / Retreat) | Keep. 4208 LOC. Leads / pipeline / invoices / proposals / analytics. Pillars already declared in admin-shell.js (`['within', 'ranch', 'retreat']`). |
| `clients.html` + `.js` | `spaces/admin/` | Within | Keep. 5559 LOC. JS header: "AWKN Within ketamine clients. Sub-tabs: Clients / Schedule / House / Services." Pillar declared `['within']`. |
| `packages.html` + `.js` | `spaces/admin/` | Cross-cutting (Within / Ranch / Retreat) | Keep. 326 LOC. Read-only service-package catalog. Pillars `['within', 'ranch', 'retreat']`. |
| `purchases.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 551 LOC. Purchase tracking + vendor management. Tab `purchases` with `feature: '_hidden'`. |
| `memberships.html` + `.js` | `spaces/admin/` | Memberships | Keep. 711 LOC. Mindbody-style member/plan management. Pillar `['memberships']`. |

**Tech-debt flagged (not in chunk 4 scope, deferred to TODO.md):** 6 hardcoded `SUPABASE_ANON_KEY` JWT literals across `crm.js` (lines 1349, 1619, 1652, 1679, 2078, 3510) and `clients.js` (line 2259). Should import from `shared/supabase.js`. Anon keys are public (RLS-protected) so this is hygiene, not security — but it's a key-rotation footgun (6 places to update vs 1). Cross-cutting tech-debt cleanup, not Phase 1 scope.

**No same-commit code changes** — chunk 4 is audit-only.

## Chunk 5 — Schedule cluster (audited 2026-05-03)

**Outcome: zero deletions, zero IoT residue.** All 4 pages are mainline AWKN scheduling/events surfaces.

| Page | Folder | Pillar | Disposition / Notes |
|---|---|---|---|
| `events.html` + `.js` | `spaces/admin/` | Cross-cutting (Ranch-leaning) | Keep. 1636 LOC. Event requests / pipeline / calendar / agreements. Imports `event-service`, `event-template-service`, `pdf-service`, `signwell-service`. `feature: '_hidden'` per admin-shell.js:103 — superseded by `venue-events.html`. **Consolidation candidate** for the Pillar IA decision (Phase 6) per TODO.md cross-cutting item. |
| `scheduling.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 900 LOC. "Google Calendar + multi-event-type bookings." Multi-staff scheduling tool. **Also a consolidation candidate** with reservations and the various \*-schedule pages. |
| `planlist.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 538 LOC. JS header: "PlanList — Public development todo / checklist page. Backed by Supabase todo_categories + todo_items tables. No authentication required." Justin's `0dfd75a4` pruned the orphan tab-map link; page still reachable by direct URL. Pattern matches testdev/devcontrol — intentional preservation. |
| `reservations.html` + `.js` | `spaces/admin/` | Master Calendar | Keep. 1870 LOC. "Booking Calendar Dashboard — Manages house stays, rental spaces, and activity bookings." Pillar already declared `['master']` in admin-shell.js:84 (the Master Calendar landing tab). |

**Pillar consolidation note (Phase 6 input):** This cluster includes 3 of the 5 pages flagged in TODO.md cross-cutting for "Consolidate overlapping pages: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`." Pass 3 tags but doesn't decide. Decision belongs in Pillar IA work.

**No same-commit code changes** — chunk 5 is audit-only.

## Chunk 6 — People + Settings cluster (audited 2026-05-03)

**Outcome: zero deletions, zero IoT residue.** All 10 pages are mainline AWKN admin/team surfaces. `brand.html` confirmed as the 5th intentional legacy redirect (joining testdev/devcontrol/manage/spaces).

| Page | Folder | Pillar | Disposition / Notes |
|---|---|---|---|
| `staff.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 340 LOC. Staff directory; respects `app_users.privacy_phone` / `privacy_bio` (values: public/residents/private). |
| `users.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 2218 LOC. User management admin. Tab `users` in admin section. |
| `job-titles.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 476 LOC. CRUD for title records + permission bundles via `get_effective_permissions`. |
| `worktracking.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 1467 LOC. "Hours — Manage associate time entries, rates, and payments." Tab `hours` gated `feature: 'associates'`. |
| `settings.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 2530 LOC. Payment methods / fee settings / SMS configuration. |
| `accounting.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 1853 LOC. Transaction ledger + refunds. |
| `brand.html` | `spaces/admin/` | Cross-cutting | Keep — **5th confirmed intentional legacy redirect** to `./dashboard.html`. Matches `shared/admin-shell.js:126` "Removed from Admin nav per request: Brand, Notifications, Test Dev, DevControl." 17 LOC. |
| `templates.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 2263 LOC. Document + email template management (two-panel: sidebar nav + editor). Gated `feature: 'documents'`. |
| `passwords.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 764 LOC. Admin-only credential vault with copy-to-clipboard. |
| `releases.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 269 LOC. Releases dashboard (history limit 50). |

**Minor branding inconsistency noted (not in Pass 3 scope):** `worktracking.js` and `accounting.js` use "AWKN Ranch Admin" in their titles while sibling admin pages use "AWKN Dashboard". Branding sweep belongs in Pass 6 docs work or its own consistency pass.

**No same-commit code changes** — chunk 6 is audit-only.

## Chunk 7 — Pillar landings + misc (audited 2026-05-03)

**Outcome: zero deletions, zero IoT residue.** All 9 pages are mainline AWKN. This chunk includes the four pillar-anchor landing pages (venue-* for Ranch, within-schedule for Within, retreat-house for Retreat) plus the canonical entry-point redirect.

| Page | Folder | Pillar | Disposition / Notes |
|---|---|---|---|
| `venue-clients.html` + `.js` | `spaces/admin/` | **Ranch** | Keep. 648 LOC. Clients deduped from `crm_leads` where `business_line='awkn_ranch'` and event_date set. Pillar declared `['ranch']` in admin-shell.js:88. |
| `venue-events.html` + `.js` | `spaces/admin/` | **Ranch** | Keep. 1370 LOC. The canonical AWKN Ranch events page — supersedes the hidden `events.html`. Pulls from `crm_leads` joined with space catalog and pipeline stage. Pillar `['ranch']`. |
| `venue-spaces.html` + `.js` | `spaces/admin/` | **Ranch** | Keep. 761 LOC. Resource calendar (14-day rolling window). Pulls bookings from `crm_leads` + rate/capacity from `spaces` and `crm_venue_catalog`. Pillar `['ranch']`. |
| `within-schedule.html` + `.js` | `spaces/admin/` | **Within** | Keep. 1715 LOC. Week view 8am-10pm showing recurring meals + Within client sessions from `scheduling_bookings` where `business_line='within'`. Pillar `['within']`. |
| `retreat-house.html` + `.js` | `spaces/admin/` | **Retreat** | Keep. 491 LOC. Calendar grid + stay creation/editing on `client_stays`. Booking modal shared with the Lodging tab in `clients.js`. Tab id `retreat-overview`, pillar `['retreat']`. |
| `dashboard.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 392 LOC. Permission-aware staff portal landing (widgets: Quick Actions, Today's Schedule, Staff on Shift). `feature: '_hidden'` per Justin's "Dashboard / Staff / Sales used to live under the 'shared' (Today) pillar, which has been removed" comment — page still serves direct URLs. |
| `index.html` | `spaces/admin/` | Cross-cutting | Keep — **canonical /spaces/admin/ entry redirect** to `./dashboard.html`, preserving query params. Critical infrastructure. 20 LOC. |
| `media.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 1474 LOC. Media library (browse/filter/manage). `feature: '_hidden'`. |
| `sms-messages.html` + `.js` | `spaces/admin/` | Cross-cutting | Keep. 588 LOC. Full SMS message list and filtering. Imports `SUPABASE_URL`/`SUPABASE_ANON_KEY` from shared (proper pattern, not the hardcoded-JWT issue from crm.js/clients.js). |

**No same-commit code changes** — chunk 7 is audit-only.

---

## Pass 3 summary

**41 pages audited across 7 chunks, 1 deletion total** (`lifeofpaiadmin.html` in chunk 1 — broken redirect to a Pass-2-deleted page).

**Pillar distribution:**
- **Ranch:** venue-clients, venue-events, venue-spaces, phyprop (4)
- **Within:** clients, within-schedule (2)
- **Retreat:** retreat-house (1)
- **Memberships:** memberships (1)
- **Master Calendar:** reservations (1)
- **Cross-cutting:** crm, packages, purchases, rentals, projects, scheduling, planlist, events, sms-messages, media, dashboard, index, staff, users, job-titles, worktracking, settings, accounting, templates, passwords, releases, brand, spaces, manage, testdev, devcontrol, appdev, highlights-order (28)
- **→ Pass 4 wholesale:** ai-admin, pai-imagery, voice (3)
- **→ Pass 4 surgery:** faq (1)

**Patterns observed:**
1. **5 intentional legacy redirects** (Justin's design): `testdev`, `devcontrol`, `manage`, `spaces`, `brand`. All preserve old URLs / permission rows; touching them would override deliberate work.
2. **Phase 6 Pillar IA consolidation candidates:** `events` vs `venue-events` overlap; `scheduling` vs `reservations` vs the various `*-schedule` pages.
3. **One tech-debt finding:** 6 hardcoded `SUPABASE_ANON_KEY` JWTs in `crm.js` + `clients.js` (TODO.md cross-cutting).
4. **One branding inconsistency:** `worktracking.js` and `accounting.js` use "AWKN Ranch Admin" titles vs "AWKN Dashboard" elsewhere (Pass 6 scope).
