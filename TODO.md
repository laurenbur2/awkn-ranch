# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`
> Phase 1 plan: `docs/superpowers/plans/2026-05-03-phase-1-alpaca-purge.md`

## Critical (blocks production)

### Phase 1 — Open questions

**Resolved Pass 6 (2026-05-04):** Upstream-template-sync (negative — `infra/` deleted, AWKN doesn't track upstream).
**Resolved earlier:** Vapi decommission GO, vehicles table DROP, PAI moot, Mac LaunchAgents irrelevant, post-login redirect, mobile/ delete.

**Still open for COO:**
- [ ] **SignWell webhook status** — Is SignWell actively used (Within inpatient agreements? AWKN Ranch retreat housing?) or fully retired? Empirically can't fire in prod (tables `signwell_config`, `rental_applications`, `lease_templates`, `event_hosting_requests` confirmed missing per Pass 5.1 audit; 0 rows in `crm_proposals` + `within_retreat_agreements`). User's hunch: not in use. Determines deletion vs dormant-but-keep.

**Still open for CTO:**
- [ ] **Open Question #2 — SignWell email CTA** (`signwell-webhook/index.ts:638, 669, 941`) — depends on SignWell decision above.
- [ ] **Bitwarden Vapi cleanup (manual)** — Search "vapi" in Bitwarden vault, delete or archive entries. Repo + CI are clean; only manual vault hygiene remains.
- [ ] **`/directory/` historical intent** — intentional AWKN scaffolding for client profiles, or partially-rebranded residue? User theory: scaffolding. Preserve regardless; answer informs Phase 5 build approach.

**Process directives:** bit-by-bit review (tier-B granularity), commits direct to `miceli`, zero prod DB writes (read-only OK), no parallel local DB during refactor (CTO call Pass 6).

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Phase 1 — Alpaca purge + repo hygiene ✅ functionally complete (2026-05-04)

All 6 passes done; ~50k+ LOC removed across the program.

- [x] **Pass 1** — Inventory manifest at `docs/superpowers/work/2026-05-03-alpaca-inventory.md`
- [x] **Pass 2** — Triage & delete (20 commits): bulk deletes, shell surgery, branding rename, license + README rewrite. ~46k LOC.
- [x] **Pass 3** — 41 admin pages audited across 7 chunks. Pillar tags at `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.
- [x] **Pass 4** — Vapi/PAI/AlpaClaw wholesale decommission. 4 batches, 22 files, ~9,500 LOC.
- [x] **Pass 5** (partial → finalized): 5.1 prod audit ✅, 5.3 BOS local toggle ✅, 5.5 cutover runbook ✅, 5.6 LOCAL-DEV.md ✅. **5.2 abandoned** (no parallel local DB during refactor — CTO call Pass 6). **5.4 deferred** to end-of-program cutover (droplet poller stop bundles with `Task 2.11`).
- [x] **Pass 6** — Aggressive close-out: insurance folder + CUSTOMIZATION.md + 9 orphan IoT services + `shared/resident-shell.js` + entire `infra/` directory + `update-checker.js` + `mobile/android/` cache. Surgery: feature-registry (-11 IoT features), shell lineage comments, /infra/ inbound link cleanup. Doc rewrites: KEY-FILES, SCHEMA (with drift warning), INTEGRATIONS (added Square + WhatsApp + Google Calendar), ECOSYSTEM-MAP (full rewrite reflecting program spec). CLAUDE.md vestigial-scope updated.

### End-of-program cutover (Task 2.11 — deferred from Pass 5.4 + Pass 4 Batch E)

Single prod-write event after Phase 6. See `docs/migrations/2026-05-04-prod-cleanup-runbook.md`.

- [ ] Undeploy 5 prod edge functions: `vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`
- [ ] Stop droplet IoT pollers (`tesla-poller`, `lg-poller`) — needs SSH config first
- [ ] Drop dormant Supabase Functions env vars on those undeployed functions

### Phase 2 — Next.js monorepo scaffold (next)

See program spec §8. Estimated 1 sprint. Brainstorm before execute.

- [ ] **Phase 2 brainstorm** — answer: Vercel team account ownership, CI/CD specifics
- [ ] Init Turborepo + pnpm workspaces at repo root
- [ ] `packages/{ui,db,auth,api,config}` skeletons
- [ ] `packages/db`: `drizzle-kit pull` against live Supabase (read-only) → `schema.ts`
- [ ] First `apps/awknranch/` Next.js scaffold (validates toolchain end-to-end)
- [ ] CI: GitHub Actions for monorepo
- [ ] Vercel project + preview deploys for `apps/awknranch/`
- [ ] `docs/MONOREPO.md` — structure, commands, conventions

### Phase 3-7 (deferred to their own brainstorms)

See program spec §9-13.

### Cross-cutting

- [ ] No tests / no TypeScript / no CI gates on money handlers (Stripe, Square, PayPal). Addressed incrementally as each phase touches the relevant code.
- [ ] **Hardcoded SUPABASE_ANON_KEY JWTs** at 6 sites: `spaces/admin/crm.js` (lines 1349, 1619, 1652, 1679, 2078, 3510) + `spaces/admin/clients.js:2259`. Should import from `shared/supabase.js` instead.
- [ ] **R2 bucket name `your-app`** — template residue hardcoded in `shared/config-loader.js`, `supabase/functions/_shared/api-helpers.ts`, `supabase/functions/_shared/property-config.ts`. Rename Cloudflare bucket + update code together.
- [ ] Audit auto-merge agentic systems (Bug Scout, Feature Builder) — they push to `main` without visible governance. **Critical to pause/repoint before Phase 6.**
- [ ] Migrate Resend, Cloudflare R2, DigitalOcean droplet from founder's personal Google account (`wingsiebird@gmail.com`) to a business workspace.
- [ ] Lock in Pillar model (Ranch / Within / Retreat / Venue) **before Phase 6**. Consolidate overlapping pages: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`. Pass 3 page-pillar tags at `docs/superpowers/work/2026-05-03-page-pillar-tags.md` are input.
- [ ] Bitwarden vault hygiene — split AWKN-specific secrets out of shared `DevOps-alpacapps` collection into a dedicated AWKN collection. SECRETS-BITWARDEN.md left as-is for now.
- [ ] Kill stale branches: `claude/romantic-maxwell`, `fix/remove-external-service-ci`, `founder-ideas`, `hero-update`.

## Enhancements (nice to have)

### Side decisions deferred to relevant phase brainstorms

- [ ] **Pricing inconsistency on awknranch.com** — `/membership` $199, `/offerings2` $119/$149/$349, `/membership-1` $144/$199/$444. Resolve in Phase 3.
- [ ] **Event platform consolidation** — Eventbrite / Partiful / Luma / direct Stripe / Recess all live. Pick one or two. Phase 3.
- [ ] **EMR strategy** — stay on Tellescope (cheap, HIPAA-compliant) or invest in in-house? Affects Phase 5 portal scope.
- [ ] **CRM consolidation** — does within.center's LeadConnector / GoHighLevel CRM eventually fold into the AWKN admin BOS? Phase 4.
- [ ] **Subdomain shape** — unified `app.*` vs separate apps per brand. Phase 5.
- [ ] **within.center blog authorship post-migration** — MDX (engineers) vs headless CMS (clinicians). Phase 4.

## Next session

1. **Run `/resume`** to load this state.
2. **Phase 2 brainstorm** — Next.js monorepo scaffold. Pre-questions: Vercel team account ownership, CI/CD specifics. Stack confirmed: pnpm workspaces + Turborepo + Next.js 16 (App Router) + tRPC + Drizzle + Supabase Auth + Tailwind v4 + shadcn/ui per `~/.claude/FRAMEWORK.md`.
3. **Branch state:** `miceli` is up to date with origin/miceli. ~50+ commits ahead of `origin/main`; stay on `miceli` per branching model.
4. **DB rule for the rest of the program:** read-only `supabase db query --linked` only (Pass 5.2 abandoned). Zero prod writes until end-of-program cutover. Drizzle introspection in Phase 2 is read-only.
