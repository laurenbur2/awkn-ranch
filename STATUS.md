# AWKN — Status

**Last Updated:** 2026-05-05 (post-audit-driven port session)
**Last Updated By:** Matthew Miceli (`miceli`)

## Project Overview

Bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`, Squarespace today)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`, WordPress today)

Single integrated business. Legacy admin BOS at `/spaces/admin/` is the source of truth and continues deploying to GitHub Pages from `main`. New Next.js app lives in `awkn-web-app/` (subfolder, coexists with legacy).

Architecture and migration plan: `docs/ECOSYSTEM-MAP.md` + `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`.

## Active program

**8-phase cleanup + Next.js refactor** in flight on `miceli`.

**Phase 0** ✅ branch reset · **Phase 1** ✅ Alpaca purge · **Phase 2** ✅ Next.js scaffold + auth · **Phase 3** 🟡 in flight

### Phase 3 reframed (this session)

Original program spec framed Phase 3 as "awknranch.com → Next.js rebuild." Mid-session reframe: actual current goal is **audit-driven port of the existing repo** (legacy public pages, BOS, edge functions) into `awkn-web-app/`, NOT rebuilding from Squarespace. The multi-domain scaffolding from Phase 2 is forward-compat — public-site rebuilds (awknranch.com / within.center) come downstream.

See `project_refactor-program-scope` memory for the full intent capture.

### Phase 3 progress this session

Audit-driven port. **12 legacy pages ported** into the new app at `awkn-web-app/`:

| Group | Pages |
|---|---|
| **Investor / Operations** (5) | `/operations`, `/investor`, `/investor-presentation`, `/investor/projections`, `/investor/projections-10y` |
| **Reference** (6) | `/pricing`, `/pricing/wordpress-embed`, `/team`, `/schedule`, `/schedule/manage`, `/retreat`, plus `/login` (functional, with session bridge to /team) |

**Deletions** (audit-confirmed, on miceli; live `main` retains until end-of-program merge):
- `bug-reporter-extension/`, `bug-reporter-firefox/` — Bug Scout extensions
- `clauded/` — internal Claude Code session dashboard (orphans `cloudflare/` Worker — flagged but not deleted)
- `assets/branding/{color-palettes,font-options,logos}.html` — preview pages only (logos remain)
- `404.html` — GH-Pages SPA-routing fallback (Next handles 404 natively)
- `lost.html` — initially restored, then deleted ("not needed in new system")
- 1 Finder dupe `investor/index 3.html` (byte-identical of already-deleted `index 2.html`)

**Patterns established this session:**

- **Verbatim Route Handler ports** via `serveLegacyHtml(legacyRelativePath, { imageBase? })` helper at `awkn-web-app/src/lib/serve-legacy-html.ts`. Reads legacy HTML from the repo root (above `awkn-web-app/`) and returns it as a `text/html` Response. Optional `imageBase` rewrites relative `images/...` refs to absolute paths (works around the trailing-slash-vs-not URL resolution issue).
- **`(internal)` route group** under `awknranch/` for ported pages that bypass `DomainNav`. Empty `layout.tsx` returns bare children. Used by all 12 ports.
- **Dev landing as live port index** at `/`. `awkn-web-app/src/lib/port-status.ts` is the manifest; the landing renders ported pages nested under each domain card grouped by `group` field. Currently shows `awknranch · 12 ported` across 3 groups (Investor / Operations · Reference · Auth via Reference).
- **Functional `/login` + legacy session bridge.** Legacy `login/index.html` ported with surgical patches: rewrites `src="app.js"` to absolute path, injects sessionStorage override for the post-login redirect, copies legacy JS deps (`login/app.js`, `shared/supabase.js`, `shared/auth.js`, `shared/version-info.js`) into `awkn-web-app/public/`. Patches the public copy of `app.js` to use new-app paths instead of hardcoded `/awkn-ranch/...` legacy URLs. After sign-in, lands at `/logged-in` (custom-styled to match login aesthetic). Session lives in `localStorage[awkn-ranch-auth]` — `/team` reads the same key, so it sees the session automatically.
- **CSP additions:** `script-src` allows `https://cdn.jsdelivr.net` (Supabase JS bundle on legacy pages); `style-src` + `font-src` allow `fonts.googleapis.com` + `fonts.gstatic.com` (Google Fonts).
- **Brand assets** copied to `awkn-web-app/public/assets/branding/` (14 files) + page-specific image dirs (`public/{investor,investor-presentation,pricing}/images/`).

### Branching + DB rules

- **Branching:** `miceli` is the long-lived workspace. Strategic well-scoped commits direct to `miceli`. No per-phase sub-branches. 19 commits this session.
- **DB:** read-only prod via `supabase db query --linked` and `drizzle-kit pull`. **No parallel local clone** (Pass 5.2 abandoned). Single prod-write event reserved for end-of-program cutover.

## Feature Status

| Area | State | Notes |
|---|---|---|
| Legacy BOS at `spaces/admin/` | ✅ Live on GitHub Pages | Source of truth until cutover |
| New Next.js app `awkn-web-app/` | 🟡 Phase 3 in flight | 12 pages ported (verbatim Route Handlers); functional /login with legacy session bridge; dev landing tracks port progress |
| Voice / PAI / Vapi | ✅ Decommissioned | Source removed in Pass 4. 5 prod edge fns still need undeployment at end-of-program cutover |
| Payments (Stripe + Square + PayPal) | ✅ Live (legacy) | Untested — no CI gates on money flows |
| SignWell webhook | 🟡 Empirically dead | Tables missing in prod; COO call pending on delete vs dormant |
| AlpacaPlayhouse residue | ✅ Removed | Phase 1 deleted ~50k+ LOC; Phase 3 deletions added small follow-ups |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress; downstream of current port |
| Client portal | ⏳ Phase 5 | Greenfield |

## Known Limitations

- No tests / no TypeScript on legacy BOS / no CI gates on money handlers — addressed incrementally per phase.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) needs to be locked before final BOS port.
- AWKN profile system (`/directory/`) has a schema gap — `app_users` is missing `slug`/`bio`/`pronouns`. Phase 5 closes the gap.
- Within Center brand tokens not yet defined in repo. Phase 4 will source from live within.center.
- **Multi-domain auth bridging:** the new app's cookie-based `@supabase/ssr` auth (used by `portal/login`, `bos/login`) and the legacy localStorage-based auth (used by ported `/login`, `/team`) are independent — sessions don't cross. The legacy bridge handles ports that use `shared/supabase.js`; cross-domain SSO post-deploy is its own follow-up.

## Recent Changes (last 5 sessions)

| Date | Change | Author |
|---|---|---|
| 2026-05-05 | **Phase 3 audit-driven port (this session):** 12 legacy pages ported into awkn-web-app via verbatim Route Handlers under `(internal)` route group. Functional `/login` with legacy session bridge to `/team`. Dev landing now tracks port progress nested per-domain. Deletions on miceli: bug-reporter extensions, clauded/, branding preview HTMLs, 404.html, lost.html, 1 Finder dupe. CSP relaxed for Google Fonts + jsdelivr. Brand assets copied into public/. 19 commits, `792d9f8f` → `848d0d31`. | Miceli |
| 2026-05-04 | **Phase 2.4:** Supabase Auth wired against existing app_users. Login form (shadcn), `getCurrentUser()` server helper, sign-out endpoint. | Miceli |
| 2026-05-04 | **Phase 2.3:** `drizzle-kit pull` introspected prod (72 tables / 873 cols / 80 FKs / 180 policies). Live AWKN spaces render on `/bos/spaces`. | Miceli |
| 2026-05-04 | **Phase 2 polish:** AWKN brand tokens ported to multi-theme architecture. Renamed `middleware.ts` → `proxy.ts`. | Miceli |
| 2026-05-04 | **Phase 2.2:** Stubbed 70+ routes for full ecosystem click-through. Route manifest, `<RouteStub>`, per-domain `<DomainNav>`, idempotent scaffold script. | Miceli |
