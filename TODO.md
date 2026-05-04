# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`
> Phase 1 plan: `docs/superpowers/plans/2026-05-03-phase-1-alpaca-purge.md`

## Critical (blocks production)

### Phase 1 — Open questions

**Resolved (2026-05-03):** Vapi decommission GO, vehicles table DROP, PAI moot, Mac LaunchAgents irrelevant. Open Question #1 (post-login redirect) resolved in `8d5ebd02` — empirical prod check found zero users with role=resident/associate. `mobile/` delete confirmed and executed (whole 1.1MB directory removed in same-day commit).

**Open for COO:**
- [ ] **SignWell webhook status** — Is SignWell actively used (Within inpatient agreements? AWKN Ranch retreat housing?) or fully retired? Empirically can't fire in prod (missing tables `signwell_config`, `rental_applications`, `lease_templates`, `event_hosting_requests`; 0 rows in `crm_proposals` + `within_retreat_agreements`). User's hunch: not in use. Determines deletion vs dormant-but-keep.

**Open for CTO:**
- [ ] **Open Question #2 — SignWell email CTA** (`signwell-webhook/index.ts:638, 669, 941`) — depends on SignWell decision above. Live surfaces (Stripe success, header dropdown, directory edit-link) already resolved in `3d0c8a7f`.
- [ ] **Bitwarden Vapi cleanup (manual)** — Search "vapi" in Bitwarden vault, delete or archive entries (VAPI_API_KEY, VAPI_WEBHOOK_SECRET, VAPI assistant IDs, etc.). Repo and CI are clean. Supabase Functions env vars on the deleted edge functions ride along with Task 2.11 prod-side undeploy at end-of-program cutover.
- [ ] **`/directory/` historical intent** — intentional AWKN scaffolding for client profiles, or partially-rebranded residue? User theory: scaffolding. Preserve regardless; answer informs Phase 5 build approach.
- [ ] **Upstream-template-sync** — `infra/updates.json`, `infra/infra-upgrade-guide.md`, `infra/infra-upgrade-prompt.md` (+ poll in `shared/update-checker.js:6`). AWKN forked per program spec — still want to track upstream features?

**Process directives:** bit-by-bit review (tier-B granularity), commits direct to `miceli`, zero prod DB writes (read-only OK).

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Phase 1 — Alpaca purge + repo hygiene (in progress)

Six passes per Phase 1 spec §6. ~38k LOC removed across Pass 2 already.

- [x] **Pass 1** — Inventory: 531-line manifest at `docs/superpowers/work/2026-05-03-alpaca-inventory.md` + gitignore (`154a1f59`)
- [x] **Pass 2** — Triage & Delete: functionally complete (20 commits, `6267b816` → `<latest>`). `property-ai/index.ts` reclassified to Pass 4. Task 2.11 prod-side undeploy deferred to end-of-program cutover.
  - [x] Tier 1 bulk deletes: build artifacts, `/residents/`, pollers, IoT edge functions, macOS dupes
  - [x] Open Question #1 resolved (post-login redirect)
  - [x] Open Question #2 resolved for live surfaces (Stripe + dropdown + directory edit-link)
  - [x] 24 admin context-switcher boilerplate sweep
  - [x] Shared shell surgery (admin-shell, associate-shell, personal-page-shell)
  - [x] 404 routing + tailwind sources + mobile copy-web cleanup
  - [x] 3 confirmed-residue file deletes (sonos-data, lighting-data, docs/alpacappsinfra.html)
  - [x] Branding rename (`package.json`, fastlane, deleted-doc link repointing)
  - [x] Proprietary licensing + AWKN-specific README rewrite
  - [x] `home-assistant-control` IoT edge function delete
  - [x] 4 manifest reclassifications (`/directory/`, `infra/`, `resident-shell.js`, `mobile/`)
  - [x] `feature-manifest.json` deleted entirely + `setup-alpacapps-infra` skill deleted (CTO chose delete over strip)
  - [x] `spaces/admin/inventory.{html,js}` deleted entirely + admin-shell + dashboard refs cleaned (CTO chose delete over strip — page was zero-AWKN-content and already `_hidden`)
  - [→] `property-ai/index.ts` (4019 lines, 236 hits) **reclassified to Pass 4 wholesale delete.** PAI moot per CTO 2026-05-03; the entire edge function dies with Vapi decommission, so surgical IoT-stripping here would be wasted work.
  - [→] **Task 2.11** undeploy 11 IoT edge functions from prod Supabase (alexa, anova, glowforge, govee, lg, nest×2, printer, sonos, tesla, home-assistant) — **deferred to end-of-program cutover.** Per prod-discipline rule, no prod-side mutation (DB writes, edge function deploy/undeploy) during refactor. Bundled with the single end-of-program prod write.
- [x] **Pass 3** — Page Audit: 41 admin pages audited across 7 chunks. 1 deletion total (`lifeofpaiadmin.html` broken redirect). 5 intentional legacy redirects preserved (Justin's design). 4 pages tagged for Pass 4 (PAI/Vapi cluster). Pillar tags: 4 Ranch / 2 Within / 1 Retreat / 1 Memberships / 1 Master / 28 Cross-cutting. Output: `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.
- [x] **Pass 4** — Vapi/PAI/AlpaClaw wholesale decommission: 4 batches, 22 files, ~9,500 LOC removed (`e4ea7abb` → `acc506fe`).
  - [x] Batch A: 13 wholesale deletes (5 edge funcs incl. property-ai 4019 lines, 6 admin pages, 2 shared modules) — 7,867 LOC
  - [x] Batch B: shell + feature-registry surgery (admin-shell, resident-shell, feature-registry)
  - [x] Batch C: page surgery (faq.{html,js} -615 LOC, accounting.{html,js}, contact/index.html)
  - [x] Batch D: webhook surgery (resend-inbound-webhook 3563→2580, all 13 PAI/AlpaClaw functions removed; herd/payments/guestbook/claudero preserved)
  - [→] Batch E: env vars + Bitwarden — repo had no Vapi env files / CI secrets. Bitwarden cleanup is a manual user action (search "vapi", delete/archive). Supabase Functions env vars on the deleted edge functions are deferred to Task 2.11 cutover per prod-discipline rule.
- [→] **Pass 5** — partial. ✅ 5.1 prod audit (`docs/superpowers/work/2026-05-04-prod-db-audit.md` — prod schema already clean, only 5 edge functions need undeploy at cutover). ✅ 5.3 BOS local toggle (`shared/supabase.js` — `?local=1` / localStorage / `window.AWKN_LOCAL_DB`). ✅ 5.5 Cutover runbook (`docs/migrations/2026-05-04-prod-cleanup-runbook.md` — DDL replaced by undeploy script, no migration needed). ✅ 5.6 `docs/LOCAL-DEV.md`. Deferred: **5.2** (full local clone — `supabase start` was kicked off but Docker pull still in flight at session end; pick up next session by running `supabase status` and the dump/restore steps from LOCAL-DEV.md), **5.4** (droplet pollers — needs SSH config for the droplet, not currently in `~/.ssh/config`; user to set up alias before next attempt).
- [ ] **Pass 6** — Docs sweep (CUSTOMIZATION, ECOSYSTEM-MAP, INTEGRATIONS, KEY-FILES, SCHEMA, SECRETS-BITWARDEN — all still reference deleted PAI/Vapi surfaces) + delete `awkn-pre-reset-2026-05-01/` insurance folder + `infra/index.html` hero refresh (currently references `property-ai-banner.png`)

### Phase 2-7 (deferred to their own brainstorms)

See program spec §8-13 for scope. Not actionable until Phase 1 lands.

### Cross-cutting

- [ ] No tests / no TypeScript / no CI gates on money handlers (Stripe, Square, PayPal). Addressed incrementally as each phase touches the relevant code.
- [ ] **Hardcoded SUPABASE_ANON_KEY JWTs** at 6 sites: `spaces/admin/crm.js` (lines 1349, 1619, 1652, 1679, 2078, 3510) + `spaces/admin/clients.js:2259`. Should import from `shared/supabase.js` instead. Hygiene/key-rotation issue, not security (anon key is public). Surface for separate tech-debt sweep.
- [ ] Audit auto-merge agentic systems (Bug Scout, Feature Builder) — they push to `main` without visible governance. Critical to pause/repoint before Phase 6.
- [ ] Migrate Resend, Cloudflare R2, DigitalOcean droplet from founder's personal Google account (`wingsiebird@gmail.com`) to a business workspace.
- [ ] Lock in Pillar model (Ranch / Within / Retreat / Venue) **before Phase 6**. Consolidate overlapping pages: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`. Pass 3 produces page-pillar tags as input.
- [ ] Kill stale branches: `claude/romantic-maxwell`, `fix/remove-external-service-ci`, `founder-ideas`, `hero-update`.

## Enhancements (nice to have)

### Side decisions deferred to relevant phase brainstorms

- [ ] **Pricing inconsistency on awknranch.com** — `/membership` $199, `/offerings2` $119/$149/$349, `/membership-1` $144/$199/$444. Resolve in Phase 3.
- [ ] **Event platform consolidation** — Eventbrite / Partiful / Luma / direct Stripe / Recess all live. Pick one or two. Phase 3.
- [ ] **EMR strategy** — stay on Tellescope (cheap, HIPAA-compliant) or invest in in-house? Affects Phase 5 portal scope.
- [ ] **CRM consolidation** — does within.center's LeadConnector / GoHighLevel CRM eventually fold into the AWKN admin BOS? Phase 4.
- [ ] **Subdomain shape** — unified `app.*` vs separate apps per brand. Phase 5.
- [ ] **within.center blog authorship post-migration** — MDX (engineers) vs headless CMS (clinicians). Phase 4.

## Resumption Pointers (for next session)

When picking this back up:

1. **Run `/resume`** to load this state.
2. **Finish Pass 5 (Tasks 5.2 + 5.4):**
   - **5.2 — Resume local clone.** Tried 3 times across two sessions with up to 7.7GB host free — all failed at the "Starting database from backup..." step when image extraction inflated host disk back to 100%, crashing the OrbStack daemon. **Realistic disk requirement: 15-20GB host free** (Supabase total extracted footprint is ~6-8GB; need that headroom on top of normal usage). libpq + psql 18.3 already installed and linked. To unblock:
     ```bash
     df -h /                              # target: 15-20GB free before retrying
     # Aggressively free host disk: Trash, Downloads, ~/Library/Caches,
     # ~/Library/Developer (Xcode), old node_modules, Application Support
     docker system prune -af --volumes    # clean any leftover partials
     supabase start -x studio,mailpit,logflare,vector,edge-runtime
     supabase db dump --linked -f /tmp/awkn-prod-dump.sql
     psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/awkn-prod-dump.sql
     # Smoke test: open http://localhost:8080/spaces/admin/dashboard.html?local=1
     ```
   - **5.4 — Droplet pollers.** Need SSH access set up first. The droplet IP/key path lives in `docs/CREDENTIALS.md` (gitignored). Add a host alias to `~/.ssh/config` (e.g. `Host awkn-droplet`), then SSH in and check `pm2 list` / `systemctl list-units --type=service --state=running | grep -iE 'tesla|lg|nest|govee|sonos'`. After Pass 2 source-side cleanup these pollers may already be dormant — verify before running stop/disable.
3. **Then Pass 6 — docs sweep + insurance-folder delete + infra/index.html hero refresh.**
4. **3 still-open CTO/COO questions** (see "Open for COO" / "Open for CTO" above):
   - SignWell webhook status (COO call — empirically dead but determines delete-vs-dormant)
   - `/directory/` historical intent (informs Phase 5 build approach; preserve regardless)
   - Upstream-template-sync (`infra/` directory — track or fork-and-forget?)
5. **Manual Bitwarden Vapi cleanup** still pending (see Critical → Open for CTO).
6. **Tech-debt flagged for separate sweep** (cross-cutting, not Pass 6 scope): 6 hardcoded `SUPABASE_ANON_KEY` JWTs in `crm.js` + `clients.js` should import from `shared/supabase.js`.
7. **Branch state:** `miceli` is up to date with origin/miceli. 38+ commits ahead of `origin/main`; stay on `miceli` per branching model.
8. **Pillar tags ready** for Phase 6 IA work — see `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.
9. **OrbStack running** (launched this session). Supabase CLI v2.95.4 linked to project `lnqxarwqckpmirpmixcw`. Read-only queries via `supabase db query --linked` work; **zero prod-side mutations** (DB writes, edge function deploy/undeploy) per prod-discipline rule.
10. **Pass 6 doc-sweep targets:** CUSTOMIZATION.md, docs/{ECOSYSTEM-MAP,INTEGRATIONS,KEY-FILES,SCHEMA,SECRETS-BITWARDEN}.md still reference deleted PAI/Vapi/AlpaClaw surfaces; `infra/index.html` hero references `property-ai-banner.png` storage URL.

The save directory at `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` is scheduled for deletion in Phase 1 Pass 6.
