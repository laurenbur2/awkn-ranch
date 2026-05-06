# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`

## Resume actions (next session — 2026-05-06 handoff)

State: local `miceli` HEAD `29ccfab2` is 15 commits ahead / 11 behind `origin/miceli`. Working tree has 5 uncommitted support fixes (proxy strip, next.config rewrite, auth bypass, flag injection, supabase-health.css). `stash@{0}` holds prior session's bos-revert workarounds as a safety net. Reflog has 8 discarded commits recoverable for ~90 days.

- [ ] **Restart Claude Code session, run `/mcp`, authenticate Supabase MCP server** — `.mcp.json` already has the entry; auth flow is interactive.
- [ ] **Grant admin role on `app_users` for `mmicel583@gmail.com`** via Supabase MCP. Plan: SELECT first to confirm row, then `UPDATE app_users SET role = 'admin' WHERE email = 'mmicel583@gmail.com' RETURNING *;`. Unlocks RLS-protected admin queries so data tables actually populate.
- [ ] **Verify dev experience end-to-end** — admin chrome renders + data loads on key pages: `/spaces/admin/dashboard`, `/spaces/admin/crm`, `/spaces/admin/venue-events`, `/spaces/admin/within-schedule` (Justin's new Edit button — incoming from main merge).
- [ ] **Commit the 5 uncommitted support fixes** as one logical commit when verified.
- [ ] **Force-push miceli to origin/miceli** (`git push --force-with-lease origin miceli`). Discards 8 commits on origin (recoverable from local reflog).
- [ ] **Replay today's repo housekeeping** on top: legacy GH-Pages site → `legacy/`, `awkn-web-app/` flatten to root, archive 9 legacy-era docs, unify CLAUDE.md/STATUS.md/TODO.md per framework. (Optionally cherry-pick `95cfd0c9` portal split + `7367f657` visitor-identity TS port from reflog before the housekeeping replay — both were small wins lost to the reset.)

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

### Phase 3 — Audit-driven port of legacy → `awkn-web-app/` (in flight)

**Reframed mid-session 2026-05-05** — original spec §9 framed Phase 3 as "awknranch.com → Next.js rebuild" (Squarespace migration). Actual current goal: **port the existing repo's pages and surfaces** (legacy public pages, BOS, edge functions) into `awkn-web-app/`. Public-site rebuilds are downstream. See `project_refactor-program-scope` memory.

**Established this session:**
- Verbatim Route Handler port pattern (`serveLegacyHtml()` helper)
- `(internal)` route group bypassing public chrome
- Dev landing as live port-progress index (`port-status.ts` manifest)
- Functional `/login` legacy bridge — sessions in `localStorage[awkn-ranch-auth]` flow into other ported pages that read the same key

**Ported (12):** `/operations`, `/investor`, `/investor-presentation`, `/investor/projections`, `/investor/projections-10y`, `/pricing`, `/pricing/wordpress-embed`, `/team`, `/schedule`, `/schedule/manage`, `/retreat`, `/login`. Plus `/logged-in` (custom).

**Continuing through ecosystem audit** — root pages remaining (events/, community/, photos/, contact/, etc.), Within Center marketing site (15 pages in `within-center/`), BOS admin (38 pages in `spaces/admin/`), associates pages, and ~63 Supabase edge functions. Per-port methodology in `project_port-methodology` memory.

**Cross-cutting follow-ups picked up this session:**
- [ ] **Cleanup of legacy `app.js` patches in public/login/app.js.** The patched copy bypasses role-based redirects; eventually want real per-role landing pages in the new app (BOS dashboard for team, portal home for members) and restore role-based routing.
- [ ] **`cloudflare/` orphan.** Worker existed primarily to feed deleted `clauded/` session dashboard. Decide delete vs keep.
- [ ] **Consolidate per-domain logins.** Phase 2.4 stubs at `portal/login` + `bos/login` use `@supabase/ssr` cookies; ported `/login` uses legacy localStorage. Bridge or pick-one post-deploy.

### Phase 4-7 (deferred to their own brainstorms)

See program spec §10-13. Phase 4 (within.center) and Phase 6 (BOS hardening) likely re-shape similarly to Phase 3's reframe.

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
2. **Continue audit-driven port.** User is directing batch-by-batch through the ecosystem audit list. Last completed: Investor / Operations + Reference (login + pricing/team/schedule/retreat). Next likely: remaining root public pages (events/, community/, photos/, contact/, waiver/, orientation/, worktrade/, planlist/, directory/, groundskeeper/, image-studio/) per the original audit list, then within-center/, then spaces/admin/.
3. **Operating mode:** loose cadence — see `feedback_audit-port-cadence` memory. User says delete/port → just do it; don't audit every inbound link before each delete; commit at natural breakpoints.
4. **Branch state:** `miceli` is N commits ahead of `origin/miceli` (this session not yet pushed) and many commits ahead of `origin/main`. Stay on `miceli`. End-of-program one big merge to `main`.
5. **Dev:** `cd awkn-web-app && npm run dev`. Visit `localhost:3000` for port-progress index. Toggle `NEXT_PUBLIC_DISABLE_AUTH` in `.env.local` to bypass auth gates on bos/portal during dev.
6. **Auth testing surface:** `awknranch.localhost:3000/login` is the legacy-styled functional sign-in. After Google or email/password, lands at `/logged-in`. Then `/team` shows live edit-capable session bridged in via `localStorage[awkn-ranch-auth]`.
