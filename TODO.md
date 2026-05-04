# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`
> Phase 1 plan: `docs/superpowers/plans/2026-05-03-phase-1-alpaca-purge.md`

## Critical (blocks production)

### Phase 1 — Open questions

**Resolved (2026-05-03):** Vapi decommission GO, vehicles table DROP, PAI moot, Mac LaunchAgents irrelevant. Open Question #1 (post-login redirect) resolved in `8d5ebd02` — empirical prod check found zero users with role=resident/associate.

**Open for COO:**
- [ ] **SignWell webhook status** — Is SignWell actively used (Within inpatient agreements? AWKN Ranch retreat housing?) or fully retired? Empirically can't fire in prod (missing tables `signwell_config`, `rental_applications`, `lease_templates`, `event_hosting_requests`; 0 rows in `crm_proposals` + `within_retreat_agreements`). User's hunch: not in use. Determines deletion vs dormant-but-keep.

**Open for CTO:**
- [ ] **Open Question #2 — SignWell email CTA** (`signwell-webhook/index.ts:638, 669, 941`) — depends on SignWell decision above. Live surfaces (Stripe success, header dropdown, directory edit-link) already resolved in `3d0c8a7f`.
- [ ] **`/directory/` historical intent** — intentional AWKN scaffolding for client profiles, or partially-rebranded residue? User theory: scaffolding. Preserve regardless; answer informs Phase 5 build approach.
- [ ] **Upstream-template-sync** — `infra/updates.json`, `infra/infra-upgrade-guide.md`, `infra/infra-upgrade-prompt.md` (+ poll in `shared/update-checker.js:6`). AWKN forked per program spec — still want to track upstream features?
- [ ] **`mobile/` status** — 1.1MB Capacitor 8 + iOS + Android, but 100% IoT control (all 5 tabs are IoT). Never shipped. Options: delete entirely vs preserve as future client-mobile scaffolding (caveat: Next.js future may use RN/PWA, Capacitor may not transfer). Currently has broken import after sonos-data.js delete.

**Process directives:** bit-by-bit review (tier-B granularity), commits direct to `miceli`, zero prod DB writes (read-only OK).

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Phase 1 — Alpaca purge + repo hygiene (in progress)

Six passes per Phase 1 spec §6. ~38k LOC removed across Pass 2 already.

- [x] **Pass 1** — Inventory: 531-line manifest at `docs/superpowers/work/2026-05-03-alpaca-inventory.md` + gitignore (`154a1f59`)
- [~] **Pass 2** — Triage & Delete: ~85% done (17 commits, `6267b816` → `a2cce3cd`)
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
  - [ ] **Hot spots remaining:** `feature-manifest.json` (37 hits), `spaces/admin/inventory.js` (28 hits), `property-ai/index.ts` IoT loaders (124 hits — voice deferred to Pass 4)
  - [ ] **Task 2.11:** undeploy 11 IoT edge functions from prod Supabase (alexa, anova, glowforge, govee, lg, nest×2, printer, sonos, tesla, home-assistant)
- [ ] **Pass 3** — Page Audit: folder-by-folder admin BOS sweep + pillar tagging (~5-7 commits)
- [ ] **Pass 4** — Vapi decommission: code, edge functions, env vars, Bitwarden (CTO confirmed)
- [ ] **Pass 5** — Audit (read-only on prod) + local Supabase clone via `supabase start` + droplet poller stop + LOCAL-DEV.md (zero prod writes)
- [ ] **Pass 6** — Docs sweep + delete `awkn-pre-reset-2026-05-01/` insurance folder

### Phase 2-7 (deferred to their own brainstorms)

See program spec §8-13 for scope. Not actionable until Phase 1 lands.

### Cross-cutting

- [ ] No tests / no TypeScript / no CI gates on money handlers (Stripe, Square, PayPal). Addressed incrementally as each phase touches the relevant code.
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
   - `feature-manifest.json` (37 hits) — strip IoT/Vapi feature flags, keep AWKN-only
   - `spaces/admin/inventory.js` (28 hits) — strip Mac LaunchDaemon + IoT inventory blobs
   - `supabase/functions/property-ai/index.ts` (124 hits) — IoT data loaders (lines ~207-262, 1391-1392, 390/468-474/566/2324 URLs); voice/Vapi parts at 3241+ deferred to Pass 4
4. **Then Task 2.11 — prod undeploy** of 11 IoT edge functions (CLI is already linked: `supabase functions delete <name> --project-ref lnqxarwqckpmirpmixcw`). Destructive against prod — explicit gate.
5. **4 CTO/COO questions accumulated** during Pass 2 audits — see "Open for COO" and "Open for CTO" sections above. SignWell, `/directory/` historical intent, upstream-template-sync, mobile/ status.
6. **18 unpushed commits** on `miceli` (since `f1556fdb` handoff). Push when convenient.
7. **OrbStack is installed** at `/Applications/OrbStack.app` — launch it once before Pass 5 to start the Docker daemon.
8. **Supabase CLI is now installed** (v2.95.4) and linked to project `lnqxarwqckpmirpmixcw` (AWKNRanch). Read-only queries via `supabase db query --linked --output table "..."` worked well during Pass 2 audits and informed several decisions empirically.

The save directory at `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` is now scheduled for deletion in Phase 1 Pass 6 (was end-of-Phase-2 in the original recommendation).
