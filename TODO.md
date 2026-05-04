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
- [ ] **Pass 5** — Audit (read-only on prod) + local Supabase clone via `supabase start` + droplet poller stop + LOCAL-DEV.md (zero prod writes)
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
2. **Pass 5 is next — local Supabase clone.** Steps:
   - Launch OrbStack (Docker daemon) once before starting
   - `supabase start` to spin up local Postgres clone
   - Stop droplet IoT pollers (`tesla-poller`, `lg-poller` — should already be dormant after Pass 2)
   - Write `LOCAL-DEV.md` documenting the local→prod workflow
   - Read-only prod audit allowed; **zero prod writes** per prod-discipline rule
3. **3 still-open CTO/COO questions** (see "Open for COO" / "Open for CTO" above):
   - SignWell webhook status (COO call — empirically dead but determines delete-vs-dormant)
   - `/directory/` historical intent (informs Phase 5 build approach; preserve regardless)
   - Upstream-template-sync (`infra/` directory — track or fork-and-forget?)
4. **Manual Bitwarden Vapi cleanup** still pending (see Critical → Open for CTO).
5. **Tech-debt flagged for separate sweep** (cross-cutting, not Pass 5 scope): 6 hardcoded `SUPABASE_ANON_KEY` JWTs in `crm.js` + `clients.js` should import from `shared/supabase.js`.
6. **Branch state:** `miceli` is up to date with origin/miceli. 35+ commits ahead of `origin/main`; stay on `miceli` per branching model.
7. **Pillar tags ready** for Phase 6 IA work — see `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.
8. **OrbStack** installed at `/Applications/OrbStack.app` — launch once before Pass 5 to start Docker daemon.
9. **Supabase CLI** v2.95.4 linked to project `lnqxarwqckpmirpmixcw` (AWKNRanch). Read-only queries via `supabase db query --linked --output table "..."` work well; **zero prod-side mutations** (DB writes, edge function deploy/undeploy) per prod-discipline rule.
10. **Pass 6 doc-sweep targets** (deferred from Pass 4): CLAUDE.md done; CUSTOMIZATION.md, docs/{ECOSYSTEM-MAP,INTEGRATIONS,KEY-FILES,SCHEMA,SECRETS-BITWARDEN}.md still reference deleted PAI/Vapi/AlpaClaw surfaces; `infra/index.html` hero references `property-ai-banner.png` storage URL.

The save directory at `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` is scheduled for deletion in Phase 1 Pass 6.
