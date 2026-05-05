# awkn-web-app — Status

**Version:** 0.1.0
**Last Updated:** 2026-05-05

## Feature Status

| Feature | Status | Notes |
|---------|--------|-------|
| Database | Working | Drizzle + Supabase, schema introspected from prod (72 tables) |
| Auth (new-app, cookies) | Phase 2.4 stub | `@supabase/ssr` cookie-based; powering `portal/login` + `bos/login` |
| Auth (legacy bridge, localStorage) | Working | Ported `/login` writes `localStorage[awkn-ranch-auth]`; ported `/team` reads same key — session bridges automatically |
| API | tRPC stub | `~/server/api/routers/example` only; real domain routers land per-port |
| UI | shadcn/ui installed | Used by phase-2.4 stubs and the dev landing; ported pages bring their own legacy CSS |
| Multi-domain proxy | Working | `proxy.ts` rewrites `*.localhost` / domain hostnames into `/<domain>/...` paths |
| Dev landing port-tracker | Working | `/` renders `port-status.ts` manifest grouped per-domain, nested per-group |

## Ported pages (12)

All under `awknranch` domain. Verbatim Route Handlers under `awknranch/(internal)/`.

**Investor / Operations (5):**
- `/operations` — Retreat operations logistics
- `/investor` — Investor overview
- `/investor-presentation` — Investor presentation deck
- `/investor/projections` — 4-Year financial model
- `/investor/projections-10y` — 10-Year financial model (slugified from `index 2.html`)

**Reference (7):**
- `/pricing` — pricing page
- `/pricing/wordpress-embed` — embeddable WP pricing widget
- `/team` — team org chart (live Supabase data)
- `/schedule` — public schedule
- `/schedule/manage` — schedule admin view
- `/retreat` — retreat house info
- `/login` — legacy AWKN team-portal sign-in (functional via legacy session bridge)

Plus `/logged-in` — custom-styled post-login landing matching the login aesthetic.

## Patterns

- **Verbatim port via Route Handler.** Self-contained legacy pages (own fonts, inline CSS, no shared chrome) get a `route.ts` that returns the raw HTML via `serveLegacyHtml()`. 1:1 visual parity, zero re-templating. See `~/lib/serve-legacy-html.ts`.
- **Image rewriting.** `serveLegacyHtml`'s `imageBase` option rewrites `images/...` and `url(images/...)` patterns to absolute paths. Image dirs copied to `public/<base>/images/`.
- **Brand assets** at `public/assets/branding/`. Logos referenced via `../assets/branding/X` from depth-1 ported pages resolve correctly.
- **Page-specific patches** in route handlers when needed (e.g., `/login` rewrites `src="app.js"` → `src="/login/app.js"` and injects a sessionStorage override).
- **Legacy JS deps** in `public/login/`, `public/shared/`. Loaded by browser via standard relative imports from the served HTML.
- **`(internal)` route group** under `awknranch/` bypasses `DomainNav`. Empty `layout.tsx` returns bare children.
- **Port-status manifest** at `~/lib/port-status.ts`. Each entry has `label`, `domain`, `path`, `legacyPath`, `group`, optional `notes`. Dev landing reads + groups it.

## Quick Commands

```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run typecheck        # Type check
npm run db:push          # Push schema to database
npm run db:studio        # Open Drizzle Studio
```

Visit:
- `http://localhost:3000/` — dev landing (port-progress index)
- `http://awknranch.localhost:3000/<path>` — awknranch pages
- `http://bos.localhost:3000/` — BOS (auth required by default)
- `http://portal.localhost:3000/` — client portal (auth required by default)
- `http://within.localhost:3000/` — Within Center

## Known Limitations

- **Multi-domain cookie sharing not solved.** `awknranch.localhost`'s sign-in cookie isn't visible to `bos`/`portal`/`within` subdomains — separate logins per domain in dev. See TODO.md tech debt.
- **Two parallel auth surfaces.** Legacy `/login` (localStorage) and Phase 2.4 `portal/login` + `bos/login` (cookies). Bridge between them is one-way: legacy ↔ legacy works, but new-app cookie auth doesn't reach legacy ports. Consolidating is post-deploy follow-up.
- **No real auth on awknranch / within / portal yet.** `NEXT_PUBLIC_DISABLE_AUTH=true` short-circuits the proxy auth gate during dev.
- **Untracked scaffolding from paused contact-port** in working tree (`aap-legacy.css`, `visitor-identity.ts`, `branding/` PNGs in public/). Harmless; reusable when public AWKN page port resumes.

## Recent Changes (last 5)

| Date | Description |
|------|-------------|
| 2026-05-05 | Audit-driven port: 12 pages, functional `/login` bridge, dev landing port-tracker. 19 commits. |
| 2026-05-04 | Phase 2.4: Supabase Auth wired against existing `app_users` |
| 2026-05-04 | Phase 2.3: Drizzle introspected from prod (72 tables); `/bos/spaces` shows live data |
| 2026-05-04 | Phase 2 polish: AWKN brand tokens, `middleware.ts` → `proxy.ts` |
| 2026-05-04 | Phase 2.2: 70+ stub routes for full ecosystem click-through |
| 2026-05-04 | Phase 2.1: Initial scaffold via `/seed` (Next 16 + React 19 + tRPC + Drizzle + Supabase + shadcn/ui) |
