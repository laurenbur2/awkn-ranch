# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`
> Phase 1 plan: `docs/superpowers/plans/2026-05-03-phase-1-alpaca-purge.md`

## Critical (blocks production)

### Phase 1 prerequisites — CTO answers (@miceli)

**Resolved 2026-05-03:**
- [x] **Vapi decommission** — GO. Approved wholesale (Pass 4 unblocked).
- [x] **Vehicles table** — DROP. Deferred to end-of-program cutover (no Phase 1 prod write).
- [x] **PAI's new identity** — moot (Vapi decommissioned wholesale).
- [x] **Mac LaunchAgents** — all irrelevant. No Mac running background processes for AWKN.

**Still open (will surface during Pass 2 Tier 2 review):**
- [ ] **New default landing page** — Replaces `/residents/cameras.html` in `login/app.js:95`. Options: `/spaces/admin/dashboard.html`, role-aware, `/portal/`, master-schedule.
- [ ] **profile.html destination** — Stripe (`create-payment-link/index.ts:128`) and SignWell (`signwell-webhook/index.ts:638, 669, 941`) email URLs depend on this.

**Process directives:**
- Bit-by-bit review — files reviewed in chunks before deletion, tier-B granularity (bulk for obvious residue, per-file for AWKN-touching surgery).
- Direct commits to `miceli`, no sub-branch.
- Zero prod DB writes during Phase 1.

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Phase 1 — Alpaca purge + repo hygiene (in progress)

Six passes per Phase 1 spec §6. ~37k LOC slated for removal across Pass 2-4.

- [x] **Pass 1** — Inventory: 531-line manifest at `docs/superpowers/work/2026-05-03-alpaca-inventory.md` + gitignore (154a1f59)
- [ ] **Pass 2** — Triage & Delete: Tier 1 categories + Tier 2 surgery + IoT edge function undeploy (~10-15 commits)
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
2. **Read the Phase 1 plan** (`docs/superpowers/plans/2026-05-03-phase-1-alpaca-purge.md`) — bite-sized executable plan.
3. **Read the Pass 1 inventory** (`docs/superpowers/work/2026-05-03-alpaca-inventory.md`) — what's about to be deleted.
4. **Pass 2 starts at Task 2.5** (build artifacts `.next/` + `out/`) per the manifest's advisory ordering — biggest LOC win, zero risk. Then `/residents/` (Task 2.1), top-level pollers (2.2), IoT edge functions (2.4), etc.
5. **Surface Open Questions #1 and #2** when `login/app.js:95` and `signwell-webhook/index.ts:638-941` come up in Pass 2 Tier 2 (Tasks 2.8 and 2.9).
6. **OrbStack is installed** at `/Applications/OrbStack.app` — launch it once before Pass 5 to start the Docker daemon.

The save directory at `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` is now scheduled for deletion in Phase 1 Pass 6 (was end-of-Phase-2 in the original recommendation).
