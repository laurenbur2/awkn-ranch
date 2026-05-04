# AWKN — Status

**Last Updated:** 2026-05-04 (post-Phase-2)
**Last Updated By:** Matthew Miceli (`miceli`)

## Project Overview

Bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`, Squarespace today)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`, WordPress today)

Single integrated business. Legacy admin BOS at `/spaces/admin/` is the source of truth and continues deploying to GitHub Pages. New Next.js app lives in `awkn-web-app/` (subfolder, coexists with legacy).

Architecture and migration plan: `docs/ECOSYSTEM-MAP.md` + `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`.

## Active program

**8-phase cleanup + Next.js refactor** in flight on `miceli`.

**Phase 0** ✅ branch reset · **Phase 1** ✅ Alpaca purge · **Phase 2** ✅ Next.js scaffold + auth · **Phase 3** ⏳ awknranch.com rebuild (next).

### Phase 2 deltas (this session) — single multi-domain app

CTO pivot from program spec §4 Decision 3: instead of a four-app monorepo, **one Next.js app at `awkn-web-app/`** serves all four surfaces via hostname-based proxy rewriting (awknranch / within / portal / bos). Simpler dev, one deploy, one Vercel project later.

- **2.1** ✅ Scaffold via `/seed`. T3-flavored stack: Next.js 16 + React 19 + tRPC + Drizzle + Supabase Auth + Tailwind v4 + shadcn/ui. Multi-domain proxy + `NEXT_PUBLIC_DISABLE_AUTH` dev bypass + AWKN brand tokens (cream + amber + DM Sans, ported from legacy `styles/tokens.css`). Within tokens are placeholder until Phase 4.
- **2.2** ✅ 70+ stub routes via route manifest + `<RouteStub>` + `<DomainNav>`. Idempotent `scripts/scaffold-stubs.mjs` regenerator. Click-through every link without 404s.
- **2.3** ✅ `drizzle-kit pull` against live prod (72 tables, 873 cols, 80 FKs, 180 RLS policies). Schema in `src/server/db/schema.ts`. Lazy DB client. Live AWKN spaces render on `bos.localhost:3000/spaces`.
- **2.4** ✅ Supabase Auth via shadcn primitives. `getCurrentUser()` joins auth.users → app_users → role. Sign-out endpoint. Bypass off → 307 to clean `/login` → form renders → signed-in role displays. Smoke-tested.

**Vercel deployment deferred** — user call. New app runs locally; production deploy comes when ready.

### Branching + DB rules

- **Branching:** `miceli` is the long-lived workspace. Strategic well-scoped commits direct to `miceli`. No per-phase sub-branches.
- **DB:** read-only prod via `supabase db query --linked` and `drizzle-kit pull`. **No parallel local clone** (Pass 5.2 abandoned). Single prod-write event reserved for end-of-program cutover.

## Feature Status

| Area | State | Notes |
|---|---|---|
| Legacy BOS at `spaces/admin/` | ✅ Live on GitHub Pages | Source of truth until Phase 6 cutover |
| New Next.js app `awkn-web-app/` | 🟡 Phase 2 done | Stub UI; one real DB-backed page; auth wired. No Vercel deploy yet |
| Voice / PAI / Vapi | ✅ Decommissioned | Source removed in Pass 4. 5 prod edge fns still need undeployment at end-of-program cutover |
| Payments (Stripe + Square + PayPal) | ✅ Live (legacy) | Untested — no CI gates on money flows |
| SignWell webhook | 🟡 Empirically dead | Tables missing in prod; COO call pending on delete vs dormant |
| AlpacaPlayhouse residue | ✅ Removed | Phase 1 deleted ~50k+ LOC |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress; Phases 3-4 migrate |
| Client portal | ⏳ Phase 5 | Greenfield |

## Known Limitations

- No tests / no TypeScript on legacy BOS / no CI gates on money handlers — addressed incrementally per phase.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) needs to be locked before Phase 6.
- AWKN profile system (`/directory/`) has a schema gap — `app_users` is missing `slug`/`bio`/`pronouns`. Phase 5 closes the gap.
- Within Center brand tokens not yet defined in repo. Phase 4 will source from live within.center.

## Recent Changes (last 5)

| Date | Change | Author |
|---|---|---|
| 2026-05-04 | **Phase 2.4 (this session):** Supabase Auth wired against existing app_users. Login form (shadcn Card/Input/Button/Alert/Label), `getCurrentUser()` server helper joining auth.users → app_users, sign-out endpoint, clean redirect URLs. Bypass off → 307 to /login → form renders → signed-in role displays. Commits: `01fcd5da`. | Miceli |
| 2026-05-04 | **Phase 2.3 (this session):** `drizzle-kit pull` introspected prod (72 tables / 873 cols / 80 FKs / 180 policies). Schema → `src/server/db/schema.ts`. Lazy DB Proxy client + split SUPABASE_DB_PASSWORD config. Live AWKN spaces render on `/bos/spaces` (Ranch House, Bali Yurt, Temple, etc). Two manual fixes to drizzle-kit output (last_name default + auth.users FK). Commit: `da65987e`. | Miceli |
| 2026-05-04 | **Phase 2 polish (this session):** Ported AWKN brand tokens (cream + amber + DM Sans) into multi-theme architecture (`themes/awkn.css` + placeholder `themes/within.css`). Renamed `middleware.ts` → `proxy.ts` (Next 16 successor). Build clean, deprecation warning gone. Commit: `0495c63e`. | Miceli |
| 2026-05-04 | **Phase 2.2 (this session):** Stubbed 70+ routes for full ecosystem click-through. Route manifest at `src/lib/routes.ts`, universal `<RouteStub>`, per-domain `<DomainNav>`, idempotent `scripts/scaffold-stubs.mjs`. 74 total routes including dev landing + tRPC. All 200, 404 sanity checks correct. Commit: `79897bb6`. | Miceli |
| 2026-05-04 | **Phase 2.1 (this session):** Next.js scaffold via `/seed` into `awkn-web-app/`. CTO pivot to single multi-domain app (not 4-app monorepo per spec). Stack: Next 16 + React 19 + tRPC 11 + Drizzle + Supabase Auth + Tailwind v4 + shadcn/ui. Hostname-based proxy. NEXT_PUBLIC_DISABLE_AUTH dev bypass. All 5 endpoints HTTP 200. Commit: `094c356d`. | Miceli |
