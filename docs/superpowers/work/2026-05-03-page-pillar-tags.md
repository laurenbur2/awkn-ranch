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
