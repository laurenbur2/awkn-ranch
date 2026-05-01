# Cleanup + Next.js Refactor — Program-Level Design Spec

**Date:** 2026-05-01
**Author:** Matthew Miceli (`miceli`) + Claude
**Status:** Approved (program-level); per-phase specs forthcoming.
**Supersedes:** N/A. Complements `docs/ECOSYSTEM-MAP.md` (which itself is partially superseded — see Decisions §4).

---

## 1. Context

The AWKN repo was forked from `rsonnad/alpacapps-infra` and inherited ~30% AlpacaPlayhouse tenant-IoT residue that has nothing to do with AWKN Ranch or Within Center. The remaining AWKN-shaped admin BOS (`spaces/admin/`) is vanilla HTML/JS + Tailwind v4 + Supabase, deployed to GitHub Pages.

This spec covers the program of work to:
1. Reset the working branch and restore project docs.
2. Purge the AlpacaPlayhouse residue.
3. Scaffold a Next.js monorepo per the unified development framework (`~/.claude/FRAMEWORK.md`).
4. Migrate every consumer-facing and operational surface to that monorepo, retaining frontend visual parity.
5. Seed a Code Graph Context (CGC) over the stabilized codebase.

The work spans an estimated 6+ months and is structured as 8 phases (numbered 0-7), each with its own brainstorm → spec → plan → execute cycle in fresh sessions.

## 2. Goals

- **Eliminate alpaca residue** from code, edge functions, droplet workers, and (eventually) the Supabase schema.
- **Stand up a Next.js monorepo** that hosts all four primary surfaces: `awknranch.com`, `within.center`, the client portal, and the admin BOS.
- **Retain frontend visual parity** during the BOS migration — staff workflows look the same, only the underlying tech changes.
- **Improve the funnel** — every public form writes a `crm_leads` row first, email is a side-effect.
- **Stabilize before indexing** — CGC seeds against the new codebase only after the migration is done.

## 3. Non-goals

- Reorganizing the IA mid-migration. The Pillar model (Ranch / Within / Retreat / Venue) refactor predates this spec and continues independently; we port to whatever IA exists when each phase activates.
- HIPAA-compliant in-house EMR. EMR strategy stays "deferred to a separate scoping pass" per `docs/ECOSYSTEM-MAP.md`.
- Solving the no-tests / no-CI-on-money-flows gap as a dedicated phase. Test coverage grows incrementally with each phase that touches money.

## 4. Decisions

| # | Decision | Notes |
|---|---|---|
| 1 | **Branch reset:** hard-reset `miceli` to `origin/main`. Preserve the 4 valuable docs (STATUS.md, TODO.md, AWKN-customized CLAUDE.md, ECOSYSTEM-MAP.md) plus this spec **before** reset (copy to a temp location outside the working tree, or stash as untracked); restore after. | User approved Option B. |
| 2 | **Migrate the admin BOS to Next.js.** | This reverses the recommendation in `docs/ECOSYSTEM-MAP.md` ("Do NOT migrate the existing admin BOS"). User accepts the longer timeline because the project will expand significantly and a unified Next.js base pays back over years. |
| 3 | **Monorepo, not polyrepo.** pnpm workspaces + Turborepo. All four apps share `packages/{ui,db,auth,api,config}`. | Standard pattern; matches unified framework. |
| 4 | **Decommission Vapi voice agents.** Pending ops-lead confirmation. | Not actively used by AWKN per current understanding. If ops lead disagrees, switch to "rewrite prompt + scope-down." |
| 5 | **CGC after the refactor.** Phase 7. | Indexing during a refactor produces a stale graph. Tool selection deferred to phase brainstorm. |
| 6 | **Frontend visual parity is required for the BOS migration.** Pixel-level diffs via Playwright snapshots. | Public sites (awknranch.com, within.center) get a lighter "looks like the old site, modulo improvements" parity bar. |
| 7 | **No prod DB DROP TABLE in Phase 1.** Audit + `pg_dump` snapshot + rehearse on test DB + soft-delete via `RENAME TO _deprecated_*` first. DROP happens in a later sprint after monitoring. | Reversibility before convenience. Read-only schema introspection (Phase 2) is safe against live prod. |
| 8 | **All work on `miceli`.** Phase sub-branches branch off `miceli` and PR back to `miceli`. `miceli` periodically PRs to `main` for production. | Matches AWKN multi-dev convention as user clarified. |

## 5. Phase map

| # | Phase | Sub-branch | PR target | Duration estimate |
|---|---|---|---|---|
| 0 | Branch reset + doc preservation | (work directly on `miceli`) | — | <1hr |
| 1 | Alpaca purge + repo hygiene | `purge-alpaca` | `miceli` | 1-2 sprints |
| 2 | Next.js monorepo scaffold | `monorepo-scaffold` | `miceli` | 1 sprint |
| 3 | `awknranch.com` → Next.js | `awknranch-nextjs` | `miceli` | 3-4 sprints |
| 4 | `within.center` → Next.js + SEO triage | `within-nextjs` | `miceli` | 3-4 sprints |
| 5 | Client portal MVP | `portal-mvp` | `miceli` | 4-6 sprints |
| 6 | Admin BOS → Next.js (visual parity) | `bos-nextjs-*` (per page/area) | `miceli` | months |
| 7 | CGC seed | `cgc-seed` | `miceli` | 1 sprint |

**Hard dependencies:**
- 1 → 2 (don't scaffold around dead code)
- 2 → all migration phases (shared packages are the contract everything binds to)
- 3 → 6 (BOS migration is gated on the stack being proven on a low-risk surface)
- 6 → 7 (CGC seeds against stabilized structure)

**Parallelizable (when team capacity allows):** 3, 4, 5 can run concurrently. Solo `miceli` work is sequential by default.

## 6. Phase 0 — Branch reset

**Steps:**
1. Save the 4 docs + this spec to a location outside the working tree (or stash as untracked).
2. `git fetch origin`
3. `git reset --hard origin/main` on `miceli`
4. `git push --force-with-lease origin miceli`
5. Restore the saved docs to their original paths.
6. Commit "restore: AWKN docs + program-level cleanup spec" on `miceli`.

**Risks:** lost commits if step 1 is skipped. Mitigation: `git reflog` recovery is available for ~30 days.

## 7. Phase 1 — Alpaca purge + repo hygiene

Six passes in order. Cross-references must be cataloged before deletion.

### Pass 1 — Bulk delete (low-judgement)
- `/residents/` directory
- Top-level IoT files (`govee_*`, `nest_*`, `tesla_*`, `lg_*`, `anova_*`, `glowforge_*`, `flashforge_*`, `printer_*`, `sonos_*`, `camera_streams_*`, `go2rtc_*`)
- `blink-poller`, `camera-event-poller` directories
- `/.next/`, `/out/` build artifacts
- `*2.md` macOS dupes
- `setup-alpacapps-infra` skill references in `CLAUDE.md`
- Branding rename: `package.json` name (`your-app-infra` → `awkn-bos`), R2 bucket reference, README placeholders

### Pass 2 — Cross-reference grep sweep
Automated catalog of every file mentioning alpaca/IoT identifiers (`govee`, `nest`, `tesla`, `pai`, `ask-pai`, `lifeofpai`, `residents/`, `your-app`). Output: a deletion manifest of suspects to manually review in Pass 3.

### Pass 3 — Page-by-page admin BOS audit (interactive)
Walk the ~25-30 real admin pages in `spaces/admin/`. For each page:
- Open the HTML and JS file.
- Claude flags: imports, table references, redirect targets, role checks, copy strings, asset paths that look alpaca-derived.
- User confirms "kill it" / "keep it, it's actually AWKN" / "needs to become X".
- Edits in the same turn.

Chunked by admin pillar (`crm/`, `master-schedule/`, `proposals/`, `clients/`, etc.), one chunk per session, compact between.

### Pass 4 — Vapi decommission (pending ops-lead confirmation)
- Remove `voice.html` / `voice.js` from admin nav and codebase.
- Decommission edge functions: `vapi-server`, `vapi-webhook`, `reprocess-pai-email`.
- Drop Vapi env vars / Bitwarden entries.
- If ops lead requires keeping Vapi: switch to prompt-rewrite + scope-down (find prompt source, rewrite for AWKN-only retreat/ranch context).

### Pass 5 — Supabase + droplet cleanup
- **Audit only** (read-only on prod) — confirm zero AWKN code references the IoT tables.
- `pg_dump` snapshot to safe storage (Bitwarden or equivalent).
- Spin up Supabase test branch (or restore dump to a separate Supabase project).
- Run purge migrations against test DB; verify the BOS works against test.
- On prod: `ALTER TABLE <iot_table> RENAME TO _deprecated_<iot_table>` (reversible).
- DROP `_deprecated_*` tables in a separate later PR after a sprint of monitoring with explicit user approval.
- Stop droplet IoT workers (`tesla-poller`, `lg-poller`).
- Decommission Tailscale home-server bridge.

### Pass 6 — Restore project docs
Cherry-pick (or restore from saved copies pre-reset): AWKN `CLAUDE.md`, `STATUS.md`, `TODO.md`, `docs/ECOSYSTEM-MAP.md`, plus this spec. Update them to reflect post-purge state.

### Exit criteria
- BOS builds and deploys to GitHub Pages; ~25-30 admin pages smoke-test green.
- Codebase line count drops ~30%.
- Zero references to deleted alpaca identifiers in remaining code.
- Prod DB has only deprecation-renamed alpaca tables (not yet dropped).
- No droplet IoT pollers running.
- Project docs restored and current.

## 8. Phase 2 — Next.js monorepo scaffold

**Tooling:** pnpm workspaces + Turborepo + TypeScript. Per-app stack: Next.js 16 (App Router) + tRPC + Drizzle + Supabase Auth + Tailwind v4 + shadcn/ui. Per `~/.claude/FRAMEWORK.md`.

**Target structure:**
```
/
├── apps/
│   ├── awknranch/     # Phase 3
│   ├── within/        # Phase 4
│   ├── portal/        # Phase 5
│   └── bos/           # Phase 6
├── packages/
│   ├── ui/            # shadcn components, Tailwind preset, design tokens
│   ├── db/            # Drizzle schema (introspected from Supabase), generated types
│   ├── auth/          # Supabase Auth helpers, role guards
│   ├── api/           # shared tRPC routers
│   └── config/        # eslint, prettier, tsconfig, tailwind base
├── spaces/admin/      # legacy vanilla BOS — STAYS until Phase 6 cutover
├── docs/
└── ...
```

**Deliverables:**
1. Init Turborepo + pnpm workspaces.
2. `packages/` skeletons (minimal, populated as phases need them).
3. `/seed apps/awknranch/` — first Next.js app, validates the toolchain.
4. `packages/db`: `drizzle-kit pull` against live AWKN Supabase (read-only — safe) → `schema.ts`.
5. `packages/auth`: Supabase Auth helpers, role guards (admin/staff/resident/associate/oracle/demo + new `client` role).
6. CI: GitHub Actions for the monorepo (lint/typecheck/build per app, Turborepo cache).
7. Vercel project + preview deploys for `apps/awknranch/`.
8. `docs/MONOREPO.md` — structure, commands, conventions.

**Out of Phase 2:** building actual pages, scaffolding `apps/within|portal|bos`, DNS cutover.

**Open questions for Phase 2 brainstorm:** Vercel team account ownership, domain control timeline (deferred per user — handled at cutover phases).

## 9. Phase 3 — `awknranch.com` → Next.js

**Strategy:** smallest, lowest-risk migration. Proves the monorepo stack end-to-end.

**Scope:**
- ~15 unique marketing pages (de-duped from current 68).
- Typed `Event` detail template (SSG + ISR).
- MDX blog scaffold (empty initially).
- B2B inquiry forms (`/privatevents`, `/collaborations`) → tRPC → `crm_leads` (the funnel-fix).
- Recess deep-link integration (external, stays).
- Stripe integration for `/offerings2` cart equivalent.
- SEO: Event/LocalBusiness JSON-LD, clean canonical URLs, `next-sitemap`, 301 redirects from old Squarespace slugs.

**Cutover:** DNS swap from Squarespace to Vercel.

**Pre-implementation gate:** lock canonical pricing — current site has 3 different prices for membership across 3 pages ($199 / $119/$149/$349 / $144/$199/$444). Content audit, not a dev decision.

## 10. Phase 4 — `within.center` → Next.js + SEO triage

**Strategy:** content triage *first*, then build. The 410 programmatic SEO pages are an active liability (Google Site Reputation Abuse risk per ECOSYSTEM-MAP).

**Pre-migration gate:**
- Pull Ahrefs/SEMrush organic traffic per URL.
- Identify the 5-10% of programmatic pages that earn traffic — keep, rewrite as Austin-only.
- Bulk 301-redirect the rest, then deindex.

**Scope post-triage:**
- ~50 core marketing/clinical pages.
- 51 hand-authored blog posts → MDX (or headless CMS — Sanity/Payload — if non-engineers will publish; Phase 4 brainstorm question).
- `Article` + `FAQPage` + `LocalBusiness` JSON-LD schema.
- WPForms → tRPC → `crm_leads`.
- Tellescope deep-link stays (HIPAA portal — external).
- Parallel-write to LeadConnector during transition; drop GHL post-cutover.

**Cutover:** DNS swap from WP Engine to Vercel. ~410+ redirects to translate from WordPress redirect plugin (or `.htaccess`) to Next.js `redirects()` config.

## 11. Phase 5 — Client portal MVP

**Strategy:** greenfield — no migration. Build on existing Supabase tables (`people`, `assignments`, `ledger`) using the established `verify-identity` edge function, SignWell, and payment links.

**MVP scope** (cut at "reduce inbound staff load"):
- My Bookings, Pay Balance, Sign Documents, Pre-Arrival Checklist, Messages (read-only), My Schedule, Receipts.

**Out of MVP:** self-serve booking, real-time chat, community feed, loyalty.

**Auth:** new `client` role added to existing `app_users` enum. Domain-aware shell (Ranch vs Within branding).

**Hosting:** `portal.awknranch.com` + `portal.within.center` (or unified `app.awknranch.com` — Phase 5 brainstorm decision).

## 12. Phase 6 — Admin BOS → Next.js (visual parity)

**Strategy:** the heaviest, longest, highest-risk phase. Page-by-page port with pixel-level visual parity, while the current vanilla BOS stays live.

**Per-page port pattern:**
1. Screenshot baseline (multiple viewports + states).
2. Create `apps/bos/app/<area>/<page>/page.tsx`.
3. Port HTML structure → JSX.
4. Port Tailwind classes verbatim.
5. Port inline `<script>` blocks → React hooks / `'use client'` components.
6. Wire data via tRPC (replacing direct Supabase JS-client calls).
7. Visual diff against baseline (Playwright snapshot test).
8. PR review + merge, one PR per page or per area.

**Cutover model:** parallel BOS during the phase. Staff use `spaces/admin/` (legacy) by default. Each ported page is accessible at `bos.awknranch.com/<area>/<page>`. Once verified, redirect the legacy URL to the Next.js URL. Staff transition organically.

**Final cutover:** when all ~25-30 pages are ported, redirect `spaces/admin/*` wholesale to `bos.awknranch.com`, then delete `spaces/admin/` from the repo.

**Phase 6 risks:**
- IA mid-refactor (Pillar model). Should be settled *before* Phase 6 begins, so we port to the new IA, not the old. Phase 6 brainstorm question.
- Auto-merge agentic systems (Bug Scout / Feature Builder) push to `main` and may modify legacy pages mid-Phase-6 — must be paused or repointed at the new BOS to prevent divergence.
- Some "vanilla" pages are ~1500 lines of imperative JS doing complex calendar/drag-and-drop work. Per-page time estimates need a Phase 6 brainstorm to do honestly.

## 13. Phase 7 — CGC seed

**Brief by design.** Full spec written when the phase activates and we know the codebase shape. Anchor commitments:

- **Tool selection deferred to phase brainstorm.** "Code Graph Context" is a category, not a single product.
- **Seed against the post-Phase-6 codebase**, not before.
- **Document usage in project `CLAUDE.md`** — not in the global unified framework. Framework is *informed* by CGC use, not modified to require it.
- **Validate value before committing** — agents demonstrably navigate faster with the graph than without (run a few representative tasks both ways). If not a clear win, don't keep it.

## 14. Cross-cutting concerns

### Concurrent work on `main`

`/sync` cadence: at the start of every working session, and before merging a phase sub-branch back to `miceli`. Visibility: `git log miceli..origin/main --oneline`, `git diff miceli origin/main`, GitHub compare view.

Specific scenario for Phase 6: teammate edits a vanilla admin page that is already ported. Different file paths → no git conflict, but behavioral divergence. **Mitigation:** CI check that fails (or warns) when `spaces/admin/<path>.*` is modified for a path that has an `apps/bos/app/<path>/page.tsx` ported counterpart. Plus a "soft freeze" convention — once a page is ported, fixes go to the new file.

SEO triage on within.center (WordPress): redirect rules and traffic data are highly portable. WordPress REST API + Redirection plugin export → Next.js `redirects()` config. Teammate triage work *feeds* Phase 4.

### Phase boundaries / session hygiene

Every phase ends with `/handoff` (updates `STATUS.md`, `TODO.md`, generates session summary). `/smart-compact` if continuing in the same window; otherwise fresh session with `/resume` next time.

Per-phase specs land in `docs/superpowers/specs/` with their own dates. This meta-spec gets a "Phase N: Complete" amendment after each phase, capturing lessons learned and any deviation from plan.

### Visual parity strategy

- **Phase 3** (awknranch): Squarespace screenshots as design references. "Looks like the old site, modulo improvements." Not pixel-perfect.
- **Phase 4** (within): same lighter pattern.
- **Phase 5** (portal): greenfield, no parity target.
- **Phase 6** (BOS): pixel-level Playwright snapshot diffs against baselines. Every page tested.

### Test / QA

This plan does not solve the no-tests gap as a dedicated phase. Each phase adds tests for its own scope:
- Phase 3 adds Vitest to the monorepo and tests `crm_leads` writes.
- Phase 6 adds Playwright snapshots.
- Any phase that touches a payment path adds tests for that path.

### Multi-dev coordination

Solo `miceli` for now. If parallel phase work becomes desirable (Phases 3 + 4 + 5 in parallel), spawn workers via `/spawn` once Phase 2 is solid. Coordination via feature sub-branches off `miceli`, `/claim` from each worker session.

### Risk / rollback per phase

- **Phase 0:** `git reflog` recovery if reset goes wrong.
- **Phase 1:** deprecation-rename pattern (not DROP); soft-delete commits revertible.
- **Phase 2:** monorepo init in sub-branch; squash-and-retry if it diverges.
- **Phases 3-5:** legacy systems (Squarespace, WordPress, current BOS) keep running until cutover. DNS rollback is a 5-minute action.
- **Phase 6:** per-page port; each page reverts to legacy independently. No big-bang cutover.

## 15. Open questions deferred to phase brainstorms

- **Phase 1:** ops-lead confirmation that Vapi is dormant.
- **Phase 2:** Vercel team account ownership; CI/CD strategy details.
- **Phase 3:** canonical membership pricing decision; Squarespace asset migration approach.
- **Phase 4:** MDX vs headless CMS for the 51 blog posts (depends on who writes post-migration).
- **Phase 5:** unified `app.*` vs per-brand `portal.*` subdomain strategy.
- **Phase 6:** IA Pillar model freeze date; pause/repoint plan for auto-merge agents (Bug Scout, Feature Builder); per-page time estimates.
- **Phase 7:** CGC tool selection.

## 16. Success criteria for the program

- All AlpacaPlayhouse residue (code, edge functions, droplet workers, DB tables) gone.
- Four Next.js apps live: `awknranch.com`, `within.center`, client portal, admin BOS.
- Every public form writes `crm_leads` first.
- Within.center has 5-10% of its old programmatic-SEO pages (the ones that earn traffic) — the rest redirected and deindexed.
- Legacy `spaces/admin/` deleted from the repo.
- Codebase indexed by CGC; agent navigation demonstrably faster.
- `STATUS.md`, `TODO.md`, `docs/ECOSYSTEM-MAP.md` reflect current state.
