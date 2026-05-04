# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`

## Critical (blocks production)

### Open questions across phases

**Resolved:** Vapi GO, vehicles DROP, PAI moot, Mac LaunchAgents irrelevant, post-login redirect, mobile/ delete, upstream-template-sync (negative), monorepo vs single-app (single-app wins).

**Still open for COO:**
- [ ] **SignWell webhook status** — Actively used for Within agreements / Ranch retreat housing, or fully retired? Empirically can't fire in prod (`signwell_config`, `rental_applications`, `lease_templates`, `event_hosting_requests` confirmed missing per Pass 5.1 audit). User's hunch: not in use. Determines deletion vs dormant-keep.

**Still open for CTO:**
- [ ] **SignWell email CTA** (`signwell-webhook/index.ts:638, 669, 941`) — depends on SignWell decision above.
- [ ] **`/directory/` historical intent** — AWKN scaffolding for client profiles, or partially-rebranded residue? Preserve regardless; answer informs Phase 5 build.

**Process directives:** strategic well-scoped commits direct to `miceli`, zero prod DB writes during refactor (read-only prod via `supabase db query --linked` + `drizzle-kit pull` only), no parallel local DB.

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Phase 1 — Alpaca purge ✅ complete

6 passes, ~50k+ LOC removed across the program. Deletion manifest at `docs/superpowers/work/2026-05-03-alpaca-inventory.md`. Pass 6 close-out commit `bc172802`.

### Phase 2 — Next.js scaffold + DB + auth ✅ complete

Single multi-domain Next.js app at `awkn-web-app/`. Phase 2.1–2.4 done. Commits `094c356d` → `01fcd5da`. Coexists with legacy code at repo root which keeps deploying to GitHub Pages.

### End-of-program cutover (Task 2.11 — bundled deferral)

Single prod-write event after Phase 6. Runbook: `docs/migrations/2026-05-04-prod-cleanup-runbook.md`.

- [ ] Undeploy 5 prod edge functions: `vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`
- [ ] Stop droplet IoT pollers (`tesla-poller`, `lg-poller`) — needs SSH config first
- [ ] Drop dormant Supabase Functions env vars on those undeployed functions

### Phase 3 — `awknranch.com` Next.js rebuild (next)

See program spec §9. Estimated 3-4 sprints. Brainstorm before execute.

**Pre-Phase-3 gates:**
- [ ] Lock canonical pricing — current site disagrees: `/membership` $199, `/offerings2` $119/$149/$349, `/membership-1` $144/$199/$444 (content audit, not dev decision)
- [ ] Decide event platform consolidation: Eventbrite / Partiful / Luma / direct Stripe / Recess. Pick one or two.

**Phase 3 brainstorm questions:**
- [ ] Vercel team account ownership (was Phase 2 question, deferred — comes due here)
- [ ] Squarespace asset migration approach (image hosting, content export)
- [ ] Visual parity workflow: how do we screenshot baseline + diff vs Squarespace during port?

**Phase 3 deliverables:**
- ~15 marketing pages (de-duped from 68 Squarespace pages)
- Typed Event detail template (SSG + ISR)
- MDX blog scaffold (empty initially)
- B2B inquiry forms (`/privatevents`, `/collaborations`) → tRPC → `crm_leads` (the funnel-fix)
- Stripe `/offerings2` cart equivalent
- SEO: Event/LocalBusiness JSON-LD, `next-sitemap`, 301 redirects from old slugs
- DNS swap from Squarespace → Vercel at cutover

### Phase 4-7 (deferred to their own brainstorms)

See program spec §10-13.

### Cross-cutting

- [ ] No tests / no TypeScript on legacy BOS / no CI gates on money handlers (Stripe, Square, PayPal). Addressed incrementally per phase.
- [ ] **Hardcoded SUPABASE_ANON_KEY JWTs** at 6 sites: legacy `spaces/admin/crm.js` (lines 1349, 1619, 1652, 1679, 2078, 3510) + `spaces/admin/clients.js:2259`. Should import from `shared/supabase.js`.
- [ ] **R2 bucket name `your-app`** — template residue hardcoded in legacy `shared/config-loader.js`, `supabase/functions/_shared/api-helpers.ts`, `supabase/functions/_shared/property-config.ts`. Rename Cloudflare bucket + update code together.
- [ ] **Audit auto-merge agentic systems** (Bug Scout, Feature Builder) — push to `main` without visible governance. **Critical to pause/repoint before Phase 6.**
- [ ] Migrate Resend, Cloudflare R2, DigitalOcean droplet from founder's personal Google account (`wingsiebird@gmail.com`) to a business workspace.
- [ ] Lock in Pillar model (Ranch / Within / Retreat / Venue) **before Phase 6**. Consolidate overlapping pages: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`. Pillar tags input: `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.
- [ ] Bitwarden Vapi entry cleanup (manual). AWKN is also leaving Bitwarden post-migration — secrets management for new app uses `.env.local` + Vercel env vars; final answer post-refactor.
- [ ] Kill stale branches: `claude/romantic-maxwell`, `fix/remove-external-service-ci`, `founder-ideas`, `hero-update`.

## Enhancements (nice to have)

### Side decisions deferred to relevant phase brainstorms

- [ ] **EMR strategy** — stay on Tellescope (cheap, HIPAA-compliant) or invest in in-house? Affects Phase 5 portal scope.
- [ ] **CRM consolidation** — does within.center's LeadConnector / GoHighLevel CRM eventually fold into the AWKN admin BOS? Phase 4.
- [ ] **Subdomain shape** — unified `app.*` vs separate apps per brand. Phase 5.
- [ ] **within.center blog authorship post-migration** — MDX (engineers) vs headless CMS (clinicians). Phase 4.

## Next session

1. **Run `/resume`** to load this state.
2. **Phase 3 brainstorm** — `awknranch.com` Next.js rebuild. Pre-questions: canonical pricing, event platform consolidation, Vercel team account, asset migration approach, screenshot-baseline workflow for visual parity.
3. **Branch state:** `miceli` is 5 commits ahead of `origin/miceli` (this session not yet pushed) and 53 commits ahead of `origin/main`. Stay on `miceli` per branching model.
4. **Where the new app lives:** `awkn-web-app/` subfolder. Run `cd awkn-web-app && npm run dev` then visit `localhost:3000`, `awknranch.localhost:3000`, `within.localhost:3000`, `portal.localhost:3000`, `bos.localhost:3000`. Toggle `NEXT_PUBLIC_DISABLE_AUTH` in `.env.local` to test auth flow.
