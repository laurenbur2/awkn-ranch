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
- [~] **Pass 3** — Page Audit: folder-by-folder admin BOS sweep + pillar tagging (~7 chunks). Output: `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.
  - [x] Chunk 1: PAI/Vapi cluster (5 pages — `lifeofpaiadmin` deleted, 4 others → Pass 4)
  - [x] Chunk 2: Internal/dev cluster — 5 pages audited, zero deletions (all AWKN-legitimate or intentional legacy redirects per Justin's `0dfd75a4`)
  - [x] Chunk 3: Operations — 4 pages audited, zero deletions (rentals/projects/highlights-order are real AWKN; spaces.html is another legacy redirect)
  - [x] Chunk 4: CRM/sales — 5 pages audited, zero deletions (all mainline AWKN: crm, clients, packages, purchases, memberships). Tech-debt flagged: 6 hardcoded anon keys in crm.js + clients.js.
  - [x] Chunk 5: Schedule — 4 pages audited, zero deletions (events/scheduling/planlist/reservations all mainline AWKN). 3 flagged for Phase 6 Pillar IA consolidation.
  - [ ] Chunk 6: People + Settings (`staff`, `users`, `job-titles`, `worktracking`, `settings`, `accounting`, `brand`, `templates`, `passwords`, `releases`)
  - [ ] Chunk 7: Pillar landings + misc (`venue-*`, `within-schedule`, `retreat-house`, `dashboard`, `index`, `media`, `sms-messages`)
- [ ] **Pass 4** — Vapi decommission: code, edge functions, env vars, Bitwarden (CTO confirmed). **Includes wholesale delete of `supabase/functions/property-ai/index.ts`** (4019 lines, was Pass 2 hot spot until reclassified).
- [ ] **Pass 5** — Audit (read-only on prod) + local Supabase clone via `supabase start` + droplet poller stop + LOCAL-DEV.md (zero prod writes)
- [ ] **Pass 6** — Docs sweep + delete `awkn-pre-reset-2026-05-01/` insurance folder

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
2. **Read the updated inventory manifest** (`docs/superpowers/work/2026-05-03-alpaca-inventory.md`) — see the 4 reclassifications added during Pass 2 audits.
3. **Pass 2 hot spots are next** (heavier decision content per file):
   - `supabase/functions/home-assistant-control/` ✅ deleted (`1387cc3e`)
   - `feature-manifest.json` ✅ deleted entirely + `setup-alpacapps-infra` skill (CTO chose delete over strip)
   - `spaces/admin/inventory.{html,js}` ✅ deleted entirely + admin-shell/dashboard cleanup (CTO chose delete over strip)
   - `supabase/functions/property-ai/index.ts` (124 hits) — IoT data loaders (lines ~207-262, 1391-1392, 390/468-474/566/2324 URLs); voice/Vapi parts at 3241+ deferred to Pass 4
4. **Then Task 2.11 — prod undeploy** of 11 IoT edge functions (CLI is already linked: `supabase functions delete <name> --project-ref lnqxarwqckpmirpmixcw`). Destructive against prod — explicit gate.
5. **4 CTO/COO questions accumulated** during Pass 2 audits — see "Open for COO" and "Open for CTO" sections above. SignWell, `/directory/` historical intent, upstream-template-sync, mobile/ status.
6. **18 unpushed commits** on `miceli` (since `f1556fdb` handoff). Push when convenient.
7. **OrbStack is installed** at `/Applications/OrbStack.app` — launch it once before Pass 5 to start the Docker daemon.
8. **Supabase CLI is now installed** (v2.95.4) and linked to project `lnqxarwqckpmirpmixcw` (AWKNRanch). Read-only queries via `supabase db query --linked --output table "..."` worked well during Pass 2 audits and informed several decisions empirically.

The save directory at `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` is now scheduled for deletion in Phase 1 Pass 6 (was end-of-Phase-2 in the original recommendation).
