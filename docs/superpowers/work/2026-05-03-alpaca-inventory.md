# Alpaca Inventory — 2026-05-03

Produced by Phase 1 Pass 1 (Task 1.1). Input to Pass 2 Triage & Delete and Pass 4 Vapi Decommission.

- **Total identifier matches:** 1,587 (`/tmp/alpaca-grep-raw.txt`)
- **Unique files matched:** 149 (`/tmp/alpaca-files.txt`)
- **Tier 1 file count (whole-file delete):** 41 matched + 18 sibling files inside Tier 1 dirs the regex didn't catch = **59 files**
- **Tier 2 file count (per-file surgery):** 99
- **Vapi-specific (deferred to Pass 4):** 9 matched + 0 unmatched = 9 files
- **Tier ? (ambiguous):** 0
- **Estimated LOC removal (Tier 1 + Vapi whole-file deletes):** ~36,838 lines (Tier 1 ≈ 34,027 + Vapi ≈ 2,811; excludes `.next/` + `/out/` build artifacts which weren't grepped per scope rules)

The regex used (from plan Step 1):

```
govee|nest_|tesla|anova|glowforge|flashforge|printer_|sonos|camera_streams|go2rtc|blink|wiz_|music[_-]assistant|residents/|your-app|alpaca|alpacaplayhouse|home-server|tailscale|vapi|voice\.|pai\.|ask-pai|lifeofpai|spirit-whisper|alexa-room|generate-whispers
```

Glob excludes (plan defaults + Pass 1 additions): `!.git !.next !out !node_modules !*.lock !docs/superpowers/specs !docs/superpowers/plans !docs/superpowers/work`.

---

## Tier 1 — Bulk-confirmable (delete by category)

Pass 2 deletes these by category-confirm. No per-file decisions needed; the directory or filename pattern is sufficient to confirm residue.

### Category 1: `/residents/` directory (32 files, ~26,085 LOC)

Whole directory. The regex matched 21 files inside; the remaining 11 are sibling pages/JS/SVG that don't happen to contain a flagged identifier in their text but live in the same residue dir.

**Matched by regex:**
- residents/3dprinter.js
- residents/appliances.html
- residents/appliances.js
- residents/ask-pai.html
- residents/ask-pai.js
- residents/cameras.js
- residents/cars.html
- residents/cars.js
- residents/devices.js
- residents/index.html
- residents/lifeofpaiadmin.html
- residents/lifeofpaiadmin.js
- residents/lighting.html
- residents/lighting.js
- residents/media.js
- residents/profile.js
- residents/residents.css
- residents/sensors.js
- residents/sonos.html
- residents/sonos.js
- residents/thermostat.js

**Inside `/residents/` but not matched by regex (still Tier 1 — same residue dir):**
- residents/3dprinter.html
- residents/bookkeeping.html
- residents/bookkeeping.js
- residents/cameras.html
- residents/climate.html
- residents/devices.html
- residents/laundry.html
- residents/media.html
- residents/profile.html
- residents/sensors.html
- residents/washer-qr.svg

### Category 2: top-level pollers (4 dirs, 14 files, ~2,911 LOC)

Whole directories.

- blink-poller/ (5 files: `.service`, `blink_snapshot.py`, `.plist`, `package.json`, `worker.js`)
- camera-event-poller/ (4 files: `.service`, `install.sh`, `package.json`, `worker.js`)
- lg-poller/ (4 files: `install.sh`, `.service`, `package.json`, `worker.js`)
- tesla-poller/ (4 files: `install.sh`, `package.json`, `.service`, `worker.js`)

### Category 3: top-level IoT files (none at repo root)

The plan's pattern `^(govee|nest|tesla|lg|anova|glowforge|flashforge|printer|sonos|camera_streams|go2rtc)_.+\.(html|js|css)$` matched zero files. All IoT code lives under `/residents/`, the pollers, or `supabase/functions/`. **Category empty — skip in Pass 2.**

### Category 4: IoT edge functions (10 dirs, 10 files, ~5,031 LOC)

Whole directories. All matched by regex except `lg-control` (regex miss — see Supplementary identifiers).

- supabase/functions/alexa-room-control/index.ts
- supabase/functions/anova-control/index.ts
- supabase/functions/glowforge-control/index.ts
- supabase/functions/govee-control/index.ts
- supabase/functions/lg-control/index.ts ← **regex missed; included by Tier 1 rule + plan**
- supabase/functions/nest-control/index.ts
- supabase/functions/nest-token-refresh/index.ts
- supabase/functions/printer-control/index.ts
- supabase/functions/sonos-control/index.ts
- supabase/functions/tesla-command/index.ts

### Category 5: build artifacts (excluded from grep, scheduled for Pass 2 delete)

- `.next/` (whole tree — Next.js abandoned attempt)
- `out/` (whole tree — exported HTML from same)

Per the plan's globs, these were excluded from the grep, so they don't appear in the unique-files count. They're still Tier 1 deletions in Pass 2.

### Category 6: macOS duplicate files (`* 2.*`, `*2.md`)

13 files outside `/.git`, `/node_modules`, `/.next`, `/out`. Some appear in Tier 2 because they reference Alpaca text; all are macOS Finder-clone dupes of legitimate files and should go regardless.

- favicon 2.svg
- investor/index 2.html
- infra/infra-upgrade-guide 2.md ← **also in Tier 2 grep hits**
- infra/infra-upgrade-prompt 2.md ← **also in Tier 2 grep hits**
- shared/update-checker 2.js ← **also in Tier 2 grep hits**
- docs/TESTING-GUIDE 2.md ← **also in Tier 2 grep hits**
- docs/SECRETS-BITWARDEN 2.md ← **also in Tier 2 grep hits**
- docs/LOCAL-AI-SETUP 2.md
- docs/CLAUDE-TEMPLATE 2.md
- docs/alpacappsinfra 2.html ← **also in Tier 2 grep hits**
- operations/index 2.html
- investor/projections/index 2.html
- supabase/migrations/20260331_create_spaces_and_ranch_house 2.sql

---

## Tier 2 — Per-file review (AWKN-touching surgery)

Real AWKN code that *references* an Alpaca identifier — usually a navigation link to `/residents/`, an import from a soon-deleted shared service, or a feature-manifest entry. Pass 2 edits these in place.

Sorted roughly by hit-count (most coupled first). Lines cited are exact `command rg` line numbers.

### Hot spots (heavy coupling — schedule first)

#### supabase/functions/property-ai/index.ts (124 hits)
Deep coupling — this is the PAI assistant brain. Hits are everywhere. Representative:
- Line 24: `goveeGroups: Array<{`
- Line 43: `teslaVehicles: Array<{`
- Line 62: `anovaOvens: Array<{`
- Lines 207–262: loads govee/nest/tesla/anova/camera_streams data
- Lines 390, 468–474, 566, 2324: hardcoded `https://laurenbur2.github.io/awkn-ranch/residents/...` URLs
- Lines 1391–1392: tool whitelist references `govee_devices`, `nest_devices`, `vehicles`, `camera_streams`, `lg_appliances`, `anova_ovens`, `voice_calls`
- Lines 3241–3473: vapi tool wrapper logic, `vapi_config` table reads, `voice_provider` defaults
- **Pass 4 territory** for the vapi/voice references; **Pass 2 surgery** for the IoT data loaders + URL strings.

#### docs/INTEGRATIONS.md (64 hits)
Documentation of every integration. Half the file is IoT-specific (Govee, Nest, Tesla, Anova, Glowforge, Sonos sections at lines 36–411). Pass 2 should rip out the IoT sections; keep AWKN-relevant integrations (Stripe, Square, PayPal, Resend, etc.).

#### feature-manifest.json — ✅ DELETED 2026-05-03 (whole file)

**CTO decision (2026-05-03):** delete entirely instead of stripping IoT/Vapi flags. The file's only consumer was the `setup-alpacapps-infra` wizard skill (also deleted in same commit). AWKN doesn't spawn other projects from this template. Documentation role is already covered by `docs/KEY-FILES.md` + `docs/ECOSYSTEM-MAP.md`. Companion: stripped 3-line comment in `supabase/functions/_shared/api-permissions.ts:40-43` referencing the manifest, and `CUSTOMIZATION.md` §4 + checklist item.

Original (pre-delete) hot-spot notes follow for historical reference:
Lines 247–511: feature-flag definitions for govee/cameras/sonos/tesla/anova/printer/glowforge/vapi. Pass 2 rewrites this to AWKN-only features.

#### spaces/admin/inventory.js — ✅ DELETED 2026-05-03 (whole file + page)

**CTO decision (2026-05-03):** delete the page entirely instead of stripping. The 523-line file documented Alpuca Mac mini at 192.168.1.200, AlpacaPlayhouse's UDM Pro / HAOS / RVAULT20, Rahul's Google Drive + Tesla dashcam, TesLoop GDrive, 91 lights / 9 Sonos / 5 Teslas / 11 cameras at AlpacaPlayhouse, plus `finleg` and `sponic-garden` repos. Zero AWKN content. Companion `inventory.html` also deleted. Already `feature: '_hidden'` in admin-shell, so user-facing impact is zero.

Same-commit reference cleanup:
- `shared/admin-shell.js`: removed `view_inventory` perm from STAFF_PERMISSION_KEYS, inventory icon entry, tab registration, and updated comment block.
- `spaces/admin/dashboard.js`: removed `Inventory` quick-action tile.

If AWKN wants an internal IT-inventory page later (Phase 5/6), build fresh against AWKN's actual infra.

#### docs/KEY-FILES.md (25 hits)
Lines 38–45 (shared services), 80 (voice.html), 90–93 (Resident View), 117–173 (IoT edge functions list). Pass 2 rewrites whole sections.

#### shared/services/sonos-data.js (24 hits)
Whole file is sonos client. Lines 9, 15, 58, 100, 113, 125, 139–140, 153, 157, 161, 165, 169, 173, 177, 187, 197, 201, 209, 218, 228, 237, 245, 246. **Should this file go full Tier 1?** It's only consumed by `residents/sonos.js`, `mobile/app/tabs/music-tab.js`, and the soon-dead `shared/resident-shell.js`. Pass 2 will likely delete the whole file once consumers are gone. Listed Tier 2 because the rules say "shared/" stays in Tier 2; the deletion is bulk-confirmable in practice.

#### docs/SCHEMA.md (20 hits)
Lines 78–303: govee/nest/tesla/camera/anova/glowforge/printer/vapi table sections. Pass 2 strips IoT tables; Pass 4 strips vapi/voice tables.

#### docs/alpacappsinfra.html and docs/alpacappsinfra 2.html (16 hits each)
Whole template-marketing page about the upstream `alpacapps-infra` template. Lines 10, 14, 21, 986, 1415, 1615, 1631–1632, 1858, 2343, 2382, 2405, 2413, 2482–2483, 2528. **Recommend whole-file delete in Pass 2** — this page has zero AWKN purpose. (Could promote to Tier 1; left in Tier 2 because the file pattern doesn't match a Tier 1 rule.)

#### docs/ECOSYSTEM-MAP.md (14 hits)
Lines 24, 28, 32–38, 40, 50–51, 78, 175, 182. The doc itself documents the alpaca-purge plan, so most hits are intentional descriptions of what's being deleted. Pass 6 (Docs) updates this to past tense.

#### supabase/functions/home-assistant-control/index.ts (13 hits)
Lines 118–497. Loops back into govee-control (lines 118, 135, 146, 162) and `wiz_proxy`/`govee_cloud` backends (lines 331, 375–497). Pass 2 surgery: remove govee/wiz fallback paths or delete the whole function (review its non-IoT use).

#### shared/services/lighting-data.js (13 hits)
Whole file is govee client. Same deletion-candidate posture as sonos-data.js.

#### shared/resident-shell.js (12 hits) — ⚠️ RECLASSIFIED 2026-05-03: Phase 5 scaffolding, NOT residue
Lines 29, 35, 65, 71, 78, 85, 199, 200, 280, 291, 300, 301. Resident portal nav shell — entire file is for `/residents/` routes. **Originally tagged whole-file delete candidate; reclassified after audit.**

Audit findings:
- Zero actual `import` statements in the repo (only comment-references in `shared/associate-shell.js:4` and `shared/personal-page-shell.js:4`).
- Justin's `0dfd75a4` "Retire DevControl page and pillar" (Apr 30) included a substantive surgical edit to this file (removing the orphan PlanList link from its tab map). File is being *tended*, not abandoned.
- By the same logic the user applied to `/directory/` (preserve client-profile scaffolding regardless of historical intent — AWKN plans to expand into client profiles in the eventual Next.js refactor), `resident-shell.js` is the eventual client-portal nav shell.

Phase 1 action: **do not delete.** Phase 5 brainstorm input.

### Boilerplate hits (admin pages with single context-switcher link)

24 admin/associate pages contain one line linking to `/residents/` from a "Resident" context-switcher button. All boilerplate. Surgery: remove the `<a href="/residents/" class="context-switcher-btn">Resident</a>` line from each.

| File | Line |
|---|---|
| associates/projects.html | 286 |
| associates/worktracking.html | 572 |
| spaces/admin/accounting.html | 41 |
| spaces/admin/ai-admin.html | 41 |
| spaces/admin/appdev.html | 667 |
| spaces/admin/dashboard.html | 138 |
| spaces/admin/events.html | 50 |
| spaces/admin/faq.html | 41 |
| spaces/admin/inventory.html | 136 |
| spaces/admin/job-titles.html | 121 |
| spaces/admin/media.html | 41 |
| spaces/admin/passwords.html | 249 |
| spaces/admin/phyprop.html | 175 |
| spaces/admin/projects.html | 266 |
| spaces/admin/purchases.html | 212 |
| spaces/admin/releases.html | 37 |
| spaces/admin/rentals.html | 50 |
| spaces/admin/reservations.html | 50 |
| spaces/admin/settings.html | 41 |
| spaces/admin/sms-messages.html | 41 |
| spaces/admin/staff.html | 136 |
| spaces/admin/templates.html | 42 |
| spaces/admin/users.html | 444 |
| spaces/admin/worktracking.html | 181 |

(Total: 24 admin pages with the single boilerplate `/residents/` context-switcher link.)

### Login & navigation redirects (Open Question #1 territory)

#### login/app.js
- Line 95: `target = '/awkn-ranch/residents/cameras.html';` — default landing redirect
- **Open Question #1:** new default landing page after `/residents/` is removed.

#### login/update-password.html
- Line 365: `window.location.href = '/residents/cameras.html';` — same default landing redirect
- **Open Question #1:** same as above.

#### mobile/scripts/copy-web.js
- Lines 207, 213: comment + replacement string "targetUrl = '/residents/cameras.html'" — mobile build script rewrites the login redirect for the mobile shell. After Pass 2 it has nothing to rewrite (the source line is gone) — Pass 2 surgery: delete the rewrite block.

#### 404.html
- Line 17: `'/your-app': '/',` — slug rewrite for the marketing template; rename to `'/awkn'` or remove.
- Line 55: `'/auth/tesla/callback': '/auth/tesla/callback.html',` — Tesla OAuth callback rewrite; remove with Tesla deletion.
- Lines 73–74: skip-list mentions `lg-poller`, `tesla-poller`, `spirit-whisper-worker`, `your-app`, `sessions` — clean up.

### Profile redirect (Open Question #2 territory)

#### supabase/functions/create-payment-link/index.ts
- Line 128: `params.append("after_completion[redirect][url]", "https://laurenbur2.github.io/awkn-ranch/residents/profile.html?payment=success");`
- **Open Question #2:** post-payment landing page (replaces `residents/profile.html`).

#### supabase/functions/signwell-webhook/index.ts
- Line 638: HTML email body — `<a href="https://laurenbur2.github.io/awkn-ranch/residents/profile.html">Complete Your Profile</a>`
- Line 669: plain-text email body — same URL
- Line 941: `const profileUrl = 'https://laurenbur2.github.io/awkn-ranch/residents/profile.html#vehicles';`
- **Open Question #2:** same as above.
- **Note:** plan task description cited lines 597 / 628 / 900; actual lines are 638 / 669 / 941 (the file has grown since the spec was written).

#### shared/admin-shell.js (also in hot spots)
- Line 56: SVG glyph keyed `lifeofpai` — Vapi/PAI nav (Pass 4)
- Line 116: nav entry `voice` → `voice.html` (Pass 4)
- Line 128: nav entry `lifeofpai` → `/residents/lifeofpaiadmin.html` (Pass 4)
- Line 332: user-menu link `/residents/lighting.html` (Pass 2)
- Lines 697, 705: `renderUserInfo(..., '/residents/profile.html')` (Pass 2 → Open Question #2)

#### shared/associate-shell.js
- Line 92: `{ id: 'devices', label: 'Devices', href: '/residents/devices.html' }`
- Line 93: `{ id: 'resident', label: 'Residents', href: '/residents/' }`
- Line 387: `renderUserInfo(siteAuthEl, state.appUser, '/residents/profile.html');`
- Line 395: `renderUserInfo(legacyUserInfo, state.appUser, '/residents/profile.html');`

#### shared/personal-page-shell.js
- Line 571: `<a href="/residents/profile.html" class="user-menu-item">Profile</a>` — Open Question #2.

#### shared/site-components.js
- Line 440: JSDoc default `profileHref='/residents/profile.html'`
- Line 442: function default `profileHref = '/residents/profile.html'`
- Line 470: mobile nav `<a href="/residents/profile.html" ...>` — Open Question #2.

### Mobile shell — ✅ DELETED 2026-05-03 (whole directory)

**Audit finding (2026-05-03):** the entire `mobile/` directory (1.1MB) was **100% IoT control scaffolding**. All 5 tabs in `mobile/app/tabs/` were IoT surfaces (cameras, music, lights, climate, cars). `mobile-app.js` orchestrated only those tabs. Apple Developer + Match cert repo never set up; app never shipped. `music-tab.js` already had a broken import to the deleted `sonos-data.js` (f373917d).

CTO confirmed delete (2026-05-03). Capacitor 8 scaffolding has limited reuse value — future mobile likely RN or PWA per program spec. Companion file `.claude/skills/setup-alpacapps-infra/references/mobile-setup.md` removed in the same commit. Doc references stripped from `README.md`, `CUSTOMIZATION.md` §9, `docs/PATTERNS.md` (Building Mobile App + Adding Tab Module + Testing item 4), `docs/KEY-FILES.md`, `docs/ECOSYSTEM-MAP.md` surface table.

### Project meta-files

#### package.json
- Line 2: `"name": "your-app-infra",` — rename to `awkn` or `awkn-ranch`.

#### package-lock.json
- Lines 2, 8: same `"your-app-infra"` name. Regenerated when package.json changes.

#### feature-manifest.json (above in hot spots)

#### styles/tailwind.css
- Line 19: `@source "../residents/**/*.js";` — remove after `/residents/` deletion.

### CLAUDE.md / STATUS.md / TODO.md / README.md / CUSTOMIZATION.md

Self-referential — these docs describe the alpaca-purge plan or list residue. Pass 6 updates them to past tense after deletion.

- CLAUDE.md lines 28, 30, 31, 33 (Vestigial scope section)
- STATUS.md lines 29, 49 (residue tracking + history entry)
- TODO.md lines 21, 36, 72 (Open Question #1, Pass 1 entry, brainstorm step)
- README.md lines 27, 56, 63, 93 (cameras / template clone URL / setup-alpacapps-infra slash command / residents path)
- CUSTOMIZATION.md lines 7, 36, 73, 87, 109 (template language + IoT references)

### Docs (Pass 6 territory mostly)

#### docs/CHANGELOG.md
- Lines 8–9: `your-app-infra template` + `/setup-your-app-infra` slash command. Pass 6 cleanup.

#### docs/DEPLOY.md
- Line 32: `Resident portal | https://laurenbur2.github.io/awkn-ranch/residents/` — drop row in Pass 6.

#### docs/SECRETS-BITWARDEN.md and `docs/SECRETS-BITWARDEN 2.md`
- Line 42: `DevOps-alpacapps | 65 | AlpacApps infrastructure secrets`
- Line 85: `DevOps-{project}` example uses `DevOps-alpacapps`

#### docs/SECRETS-GUIDE.md
- Line 4: `Replicable across all projects (your-app, finleg, portsie, etc.)`
- Line 24: `DevOps-{project}` example uses `DevOps-your-app`
- Lines 72, 78, 81, 84: `op://DevOps-your-app/...` examples

#### docs/TESTING-GUIDE.md and `docs/TESTING-GUIDE 2.md`
- Line 7: test email `testuser@alpacaplayhouse.com`
- Line 29: test instruction with same email

### Infra — ⚠️ RECLASSIFIED 2026-05-03: mixed-status, NOT bulk-delete

The `infra/` directory was originally tagged as "template residue — Pass 6 territory" with whole-file delete recommendations. Audit found a mix of AWKN-rebranded files and upstream-template-sync residue.

**AWKN-rebranded — KEEP:**
- `infra/index.html` — `<title>AWKN Ranch Infra — Set Up Your AI-Powered Platform</title>`. Linked from `clauded/architecture.html:84,220` and `clauded/sessions.html:357,385`. Real AWKN-side infra setup wizard.
- `infra/setup-guide.html` — `<title>AWKN Ranch Setup Guide — Instructions for Claude Chat</title>`.
- `infra/updates.html` — `<title>AWKN Ranch Updates — Sync New Features</title>`.
- `infra/llm-setup-instructions.md` — "AWKN Ranch Setup Instructions (Machine-Readable)" — canonical LLM-facing reference for setting up AWKN Ranch.
- `infra/og-infra.jpg` — companion OG image.

The earlier line-number citations (1297, 1403, 1448, 1525, 1544 in `index.html`; 375, 382 in `setup-guide.html`) call for in-place rewrites of `/residents/`, `your-app`, etc. references — Pass 2 surgery, not file deletion. **Pass 2 line-level surgery still needed but file stays.**

**Upstream-template-sync mechanism — defer to CTO call:**
- `infra/updates.json` — `templateRepo` field still points at `rsonnad/alpacapps-infra` upstream; `updatesPage` points at `alpacaplayhouse.com`. This is the feed that `shared/update-checker.js` polls.
- `infra/infra-upgrade-guide.md` — still titled "AlpacApps Infra — Upgrade Guide". For syncing new features from upstream template.
- `infra/infra-upgrade-prompt.md` — still titled "AlpacApps Infra — Upgrade Prompt". Same purpose.

These are dormant residue IF AWKN has truly forked away from the upstream template (which the program spec states). But that decision should be confirmed with the CTO before deletion — the team may still want to track upstream features.

Phase 1 action: **do not delete the `infra/` dir.** Surface the upstream-sync question to CTO. Apply line-level Pass 2 surgery to `infra/index.html` and `infra/setup-guide.html` for the deleted-path references.

### Other admin / app surfaces

#### directory/app.js — ⚠️ RECLASSIFIED 2026-05-03: Phase 5 scaffolding, NOT residue

The whole `/directory/` system (`directory/index.html`, `directory/app.js`, `directory/styles.css`) is **incomplete scaffolding for AWKN's planned client profile feature**. Confirmed by user 2026-05-03: profiles were intentionally scaffolded for AWKN but never finished.

- `directory/index.html` is AWKN-branded (`<title>AWKN Ranch</title>`, AWKN site CSS).
- `directory/app.js` queries `app_users` for `slug, bio, pronouns, instagram, gender, whatsapp, phone2, birthday, links, nationality, location_base, privacy_settings` — **none of those columns exist on `app_users` in prod today** (verified via Supabase Management API). The page returns PostgREST 400 in prod; non-functional.

Phase 1 action: **do not delete.** Pass 2 surgery completed in `3d0c8a7f`:
- Stripped the broken `<a href="/residents/profile.html">Edit Profile</a>` at line 165.
- Added `TODO(Phase 5)` comment so the schema gap is discoverable when client portal lands.

Phase 5 brainstorm input: the missing `app_users` columns and the now-deleted `/residents/profile.html` editor UX are inputs to the client portal scope.

#### clauded/sessions.html
- Line 359: `'https://claude-sessions.your-app.workers.dev'` — Cloudflare Worker URL with `your-app` placeholder. Rename.

#### contact/index.html
- Line 753: `<a href="/docs/your-appinfra.html" class="quick-link-card">` — broken link after Pass 2.

#### associates/projects.html and `associates/worktracking.html`
- Already in boilerplate table above.

#### spaces/admin/accounting.html / accounting.js / faq.html / faq.js
- accounting.html line 247: `<option value="vapi">Vapi</option>` — Pass 4.
- accounting.js lines 985, 1178, 1299, 1312: vapi vendor accounting category — Pass 4.
- faq.html line 377: `<option value="vapi">Vapi</option>` — Pass 4.
- faq.js lines 1212, 1292, 1380, 1381: vapi voice config — Pass 4.

#### spaces/admin/crm.js — **REGEX FALSE POSITIVE — leave alone in Pass 2**
- Lines 2852, 2854, 4109: contain `crm_invoices`, `existingInvoice.id`, `invoice.id`. The regex matches `voice\.` inside `inVOICE.` — a substring artifact. No Alpaca residue. See "Spot-check findings" #3 for verification.

#### spaces/verify.html
- Lines 603, 664: `<a href="https://USERNAME.github.io/REPO/docs/your-appinfra.html" class="infra-banner">` — placeholder URL. Pass 6 cleanup.

#### visiting/index.html
- Line 104: prose paragraph mentioning Sonos S1 and "black rock city wifi". User-facing prose — keep but rephrase if `/residents/sonos.html` no longer exists.

### Backend helpers

#### supabase/functions/_shared/api-helpers.ts
- Line 300: `vendor: "your-app_api",` — telemetry tag. Rename.

#### supabase/functions/_shared/api-permissions.ts
- Lines 241–242: `tesla_accounts` permission entry. Pass 2 surgery — remove tesla_accounts ACL.

#### supabase/functions/_shared/receipt-processor.ts — **REGEX FALSE POSITIVE — leave alone in Pass 2**
- Line 59: `const prompt = \`You are a receipt parser. Extract ALL information from this receipt/invoice.` — the regex matches `voice\.` inside `inVOICE.` (in `invoice.`). No Alpaca residue. See "Spot-check findings" #4.

#### supabase/functions/api/index.ts
- Line 156: `tesla_accounts: handleTeslaAccounts,`
- Line 1757: section header `// ─── tesla_accounts ─`
- Lines 1761, 1766, 1775, 1786: `tesla_accounts` table CRUD. Pass 2 — remove handler.

#### supabase/functions/ask-question/index.ts
- Line 124: prose suggesting users "use the resident portal at https://laurenbur2.github.io/awkn-ranch/residents/" — Pass 2 update prompt.

#### supabase/functions/resend-inbound-webhook/index.ts
- Lines 1079, 1111, 1575, 1608: prose email replies referencing `/awkn-ranch/residents/`. Pass 2 — update copy.

### Migrations (database)

#### supabase/migrations/20260303_add_network_client_aliases.sql
- Line 42: insert `('blink-device', 'Blink Camera', 'camera', null)` — Pass 2 → migration delete or no-op.

#### supabase/migrations/20260304_home_assistant_unified_lighting.sql
- Lines 36, 132, 133, 138, 145, 146, 151: `wiz_proxy` and `govee_cloud` backend definitions. Pass 2 / Pass 5 — IoT-table cleanup migration.

### Scripts (Cloudflared)

#### scripts/cloudflared/com.cloudflare.tunnel.plist
- Lines 13, 23, 26: `alpaca-cam` tunnel name + `/Users/alpaca/...` paths. **Whole-file delete candidate** (Cloudflared tunnel for camera streaming = IoT residue). Pass 2.

#### scripts/cloudflared/config.yml
- Lines 6, 9, 13, 20: same — `cloudflared tunnel create alpaca-cam`. Whole-file delete.

### `shared/update-checker.js` and `shared/update-checker 2.js`
- Lines 6–7: poll `https://alpacaplayhouse.com/infra/updates.json`. **Whole-file delete** (we aren't using upstream template updates).

---

## Vapi-specific (deferred to Pass 4)

Voice / PAI / Vapi files. Pass 4 will run a separate cost-of-ownership review against Vapi spend before deletion. Not deleted in Pass 2.

### Files (whole-file delete candidates after Pass 4 review)

- spaces/admin/voice.html (~25.7 KB) — admin voice-assistant management
- spaces/admin/voice.js — companion JS (regex matched but file size unverified; let me note: actually `voice.js` matched separately as its own file; verified existence)
- spaces/admin/lifeofpaiadmin.html — Life-of-PAI admin
- spaces/admin/pai-imagery.html (~4.5 KB) — PAI imagery generation admin
- shared/voice-service.js — voice client lib
- shared/pai-widget.js (~8 KB) — embeddable PAI chat widget

### Edge functions (whole-dir delete candidates after Pass 4 review)

- supabase/functions/vapi-server/index.ts (~12 KB)
- supabase/functions/vapi-webhook/index.ts
- supabase/functions/reprocess-pai-email/index.ts — re-runs receipt/document processing on inbound email; touches `_shared/receipt-processor.ts` and `_shared/r2-upload.ts`. **PAI-named but not voice-related** — verify scope before deletion.
- supabase/functions/generate-whispers/index.ts (~16.7 KB) — voice-related per task instructions; verified in scope.

### Files that reference Vapi/PAI but aren't pure-residue (Pass 4 surgical edits)

- supabase/functions/property-ai/index.ts (above) — vapi tool wrappers from line 3241+; surgery, not deletion.
- shared/admin-shell.js (above) — `lifeofpai` and `voice.html` nav entries.
- shared/resident-shell.js — `askpai` nav entries (lines 78, 85), `view_voice` perm (line 280), `admin_pai_settings` (line 291).
- spaces/admin/accounting.html / accounting.js / faq.html / faq.js — vapi vendor categories.
- docs/INTEGRATIONS.md / KEY-FILES.md / SCHEMA.md / ECOSYSTEM-MAP.md — references in docs.
- residents/ask-pai.html / ask-pai.js / lifeofpaiadmin.html / lifeofpaiadmin.js — already going in Tier 1 Category 1.

---

## Tier ? (ambiguous)

None on inspection. A few candidates I considered moving up:

- `shared/services/sonos-data.js`, `shared/services/lighting-data.js`, `shared/services/glowforge-data.js`, `shared/services/cars-data.js`, `shared/services/climate-data.js`, `shared/services/oven-data.js`, `shared/services/printer-data.js`, `shared/services/camera-data.js` — pure IoT client libs, only consumed by Tier 1 deletion targets. Functionally Tier 1, but the path doesn't match the Tier 1 rule. Pass 2 should bulk-delete after confirming the consumer chain (it'll be self-evident once `/residents/` is gone — these become unimported).
- `shared/resident-shell.js` — only consumed by `/residents/*` pages. Functionally Tier 1.
- `docs/alpacappsinfra.html`, `docs/alpacappsinfra 2.html`, `infra/index.html`, `infra/infra-upgrade-*`, `infra/setup-guide.html`, `infra/updates.json` — entire-file template residue with no AWKN content. Functionally Tier 1.
- `scripts/cloudflared/*` — IoT tunnel for camera streaming. Functionally Tier 1.

These are flagged inline in their Tier 2 entries with **whole-file delete candidate** notes so Pass 2 can promote them. None left genuinely ambiguous.

---

## Supplementary identifiers found (regex misses)

These directories/files are clearly Alpaca/IoT residue but didn't match the Step 1 regex. They're known via the plan's Tier 1 rules or by structural inspection. Pass 2 should include them by category, not by grep-recurrence.

1. **`supabase/functions/lg-control/index.ts`** — IoT edge function for LG ThinQ. The regex includes `lg-poller` (no — actually only `blink|wiz_|music[_-]assistant`, `lg` is not a regex token at all). Internal contents say `LgControlRequest`, `applianceId`, `LG ThinQ` — none of those hit the regex. Catch via Tier 1 Category 4.

2. **`mobile/app/tabs/cameras-tab.js`, `cars-tab.js`, `climate-tab.js`, `lights-tab.js`** — sibling IoT mobile tabs. Use terms like `vehicles`, `thermostats`, `Hls`, `loadVehicles`, `Govee` (capitalized — regex is case-sensitive and matched `govee` only when lowercase elsewhere; the JSDoc on `lights-tab.js` says "Govee" capital-G which doesn't hit `govee`). All four were IoT mobile tab residue. ✅ Resolved 2026-05-03: entire `mobile/` directory deleted.

3. **`auth/tesla/`** (referenced in 404.html line 55, feature-manifest line 297) — Tesla OAuth callback dir. Should also be Tier 1.

4. **`residents/` 11 unmatched siblings** — listed under Category 1 above, included by directory rule.

5. **Inside Tier 1 dirs**, several files (e.g. `blink-poller/blink-poller.service`, `tesla-poller/tesla-poller.service`, `camera-event-poller/camera-event-poller.service`, `camera-event-poller/package.json`, `camera-event-poller/worker.js`, `lg-poller/lg-poller.service`, `lg-poller/package.json`) didn't all show up in the unique-paths list because their content didn't always include a regex hit. They're still Tier 1 by directory rule.

6. **`supabase/functions/create-tesla-account/`** — referenced in docs (`create-tesla-account` mentioned at `docs/KEY-FILES.md:123`, `spaces/admin/inventory.js:300`) but **the function itself does not exist on disk** today (`ls supabase/functions/ | grep tesla` shows only `tesla-command`). Stale doc reference. Pass 6 cleanup.

7. **`spirit-whisper-worker/`** — referenced at `404.html:73` and `feature-manifest.json:495`. Not present on disk as a top-level dir. Stale references. Pass 6 cleanup (or Pass 4 if voice-related).

8. **`vehicles` table** (per task instructions, deferred to end-of-program cutover migration). Confirmed referenced in: `feature-manifest.json:298`, `spaces/admin/inventory.js:309`, `supabase/functions/property-ai/index.ts` (multiple), `supabase/functions/api/index.ts:156`, `docs/SCHEMA.md:116`, `docs/INTEGRATIONS.md:333`. Filed under Tier 2 surgery; the table itself is dropped in the cutover migration.

---

## Spot-check findings

Random spot-checks of 5 files per tier (existence + line accuracy):

### Tier 1 (5/5 pass)
- residents/ask-pai.html — exists, 5036 bytes ✓
- blink-poller/worker.js — exists, 14757 bytes ✓
- lg-poller/worker.js — exists, 18175 bytes ✓
- supabase/functions/govee-control/index.ts — exists, 8655 bytes ✓
- residents/cars.html — exists, 5022 bytes ✓

### Tier 2 (5/5 pass)
- login/app.js:95 — `target = '/awkn-ranch/residents/cameras.html';` ✓ (note: plan referenced line 90; actual is 95 — file evolved)
- shared/admin-shell.js:128 — `{ id: 'lifeofpai', label: 'Life of PAI', href: '/residents/lifeofpaiadmin.html', ...` ✓
- supabase/functions/create-payment-link/index.ts:128 — `params.append("after_completion[redirect][url]", "https://laurenbur2.github.io/awkn-ranch/residents/profile.html?payment=success");` ✓
- spaces/admin/dashboard.html:138 — `<a href="/residents/" class="context-switcher-btn">Resident</a>` ✓
- shared/services/sonos-data.js:9 — `const SONOS_CONTROL_URL = `${SUPABASE_URL}/functions/v1/sonos-control`;` ✓

### Vapi-specific (5/5 pass)
- spaces/admin/voice.html — exists, 25711 bytes ✓
- supabase/functions/vapi-server/index.ts — exists, 11985 bytes ✓
- supabase/functions/generate-whispers/index.ts — exists, 16685 bytes ✓
- shared/pai-widget.js — exists, 8043 bytes ✓
- spaces/admin/pai-imagery.html — exists, 4563 bytes ✓

### Anomalies investigated

1. **`supabase/functions/signwell-webhook/index.ts`** — plan says lines 597, 628, 900 contain `residents/profile.html`. Actual lines are 638, 669, 941 (file has grown ~40 lines since spec was written). Manifest cites the actual current lines. ✓ resolved.

2. **`login/app.js`** — plan and TODO.md cite line 90 as the `/residents/cameras.html` redirect. Actual is line 95. Manifest cites the actual current line. ✓ resolved.

3. **`spaces/admin/crm.js` lines 2852/2854/4109** — investigated as the regex *does* match these lines. Root cause: the alternate `voice\.` matches the substring `voice.` inside `crm_invoices).`, `existingInvoice.id`, and `invoice.id`. **Substring false-positive, not Alpaca residue.** Verified by `rg -o` against just those lines, which output `voice.` × 3 — i.e. it's matching the trailing 5 chars of `invoice.`. Marked Tier 2 entry as "leave alone in Pass 2."

4. **`supabase/functions/_shared/receipt-processor.ts:59`** — same root cause. Line 59 reads `const prompt = \`You are a receipt parser. Extract ALL information from this receipt/invoice.` — the substring `invoice.` triggers the `voice\.` alternate. False positive. Marked "leave alone."

5. **`spaces/admin/accounting.html:41`, `spaces/admin/inventory.html:136`, etc.** — all confirmed: each contains the boilerplate `<a href="/residents/" class="context-switcher-btn">Resident</a>` line. ✓.

6. **`docs/CHANGELOG.md` lines 8–9** referencing `your-app-infra` and `/setup-your-app-infra` — these read literally `your-app` (the placeholder, not `awkn`). The doc is partially-customized template text. Confirmed real residue.

7. **`mobile/scripts/copy-web.js:213`** — verified: `"targetUrl = '/residents/cameras.html'"` is the exact string the script greps-and-replaces in the mobile build to redirect to mobile root instead of `/residents/`. After Pass 2 the source string is gone, so the script's replacement loop becomes a no-op. Surgery: delete the rewrite block in Pass 2.

No spot-check failures. All cited lines verified.

---

## Pass 2 ordering recommendation (advisory)

For Pass 2 sequencing, suggest:

1. Tier 1 Category 5 (build artifacts `.next/`, `out/`) — biggest LOC win, zero risk, no Tier 2 references to `.next/`.
2. Tier 1 Category 1 (`/residents/`) — biggest functional residue. Triggers downstream Tier 2 link-cleanups in shells + boilerplate admin pages. Open Question #1 must be answered before this completes.
3. Tier 1 Category 2 (top-level pollers) — independent.
4. Tier 1 Category 4 (IoT edge functions) — independent. After this, `shared/services/{govee,sonos,nest,tesla,anova,glowforge,printer,camera}-data.js` become unimported and can be deleted (Tier ? promotion).
5. Tier 1 Category 6 (macOS dupes) — trivial cleanup.
6. Tier 2 boilerplate sweep (24 admin pages × 1 line each).
7. Tier 2 hot spots (property-ai, inventory.js, feature-manifest.json) — surgical edits.
8. **Pause: user decisions on Open Questions #1 and #2.** Apply login/app.js:95, login/update-password.html:365, mobile/scripts/copy-web.js:207–213, signwell-webhook lines 638/669/941, create-payment-link:128 once decisions are made.
9. Tier 2 docs (KEY-FILES.md, INTEGRATIONS.md, SCHEMA.md) — Pass 6 territory but can ride along.
10. Vapi-specific: defer to Pass 4 entirely.
11. End-of-program: drop `vehicles` and other IoT tables in cutover migration.
