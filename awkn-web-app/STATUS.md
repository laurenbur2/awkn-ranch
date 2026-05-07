# awkn-web-app — Status

**Version:** 0.1.0
**Last Updated:** 2026-05-06 (session: Phase 6a local complete + repo-split prep)
**Last Updated By:** Matthew Miceli

---

## What this is

Multi-domain Next.js 16 app backing the AWKN business. Three brands, four hostname spaces, one codebase:

- **`awknranch.com`** — public AWKN Ranch marketing site (Lauren's redesigned 8-page public site lives here)
- **`team.awknranch.com`** — team operating system (sign-in landing + 39 BOS admin pages, auth-gated)
- **`within.center`** — Within Center clinical brand site (38 pages)
- **`portal.awknranch.com`** — eventual client portal (Phase 5+, currently scaffold-only)

Multi-domain routing via `proxy.ts` (Next 16 successor to `middleware.ts`) — the same codebase serves different content per hostname, with `*.localhost` working automatically in dev.

## Current state at a glance

| Layer | State |
|---|---|
| **Phase 6a (local impl)** | ✅ Complete — team subdomain consolidation + M2 (centralized JWTs) + M3 (server-side gates for risky writes) |
| **Phase 6a-Deploy** | ⏳ Pending — Vercel + DNS cutover. Awaiting repo split + new GitHub repo + Vercel project |
| **Phase 6b** | 📋 Framed — long-game React rebuild, page-by-page on a separate branch. No time pressure. |
| **Production** | Not yet deployed — code lives on `miceli` branch of the legacy repo until split |

## Port catalog — 110 entries across 5 domains

| Domain | Group | Count |
|---|---|---|
| `awknranch` | Public site (home + property/book/host-a-retreat/services/events/contact/team) | 8 |
| `awknranch` | Investor / Operations | 5 |
| `awknranch` | Reference (pricing, schedule, retreat) | 6 |
| `team` | Auth (login + reset/update/email-confirm) | 5 |
| `team` | Team Portal (root sign-in + team-chart + logged-in) | 3 |
| `team` | BOS Admin | 39 |
| `within` | Marketing + Booking + Ceremonial Ketamine + Immersive Retreat + Resources + Conditions + Email Templates + Clinical (future) | 38 |
| `team` | API routes (M3 server-side gates, not in port-status.ts) | 5 |

Each entry maps to a Route Handler that serves legacy HTML verbatim via `serveLegacyHtml()`. Source of truth lives in `legacy/` (bundled inside this app — see [§Architecture](#architecture)).

## Phase 6a — what landed (2026-05-06)

9 commits, `71b176da` → `f93c1ac3`, all on `miceli` branch:

- **6a.4** — Associates surface retired (4 routes + legacy + public mirror, -9319 lines)
- **6a.1** — M2: 12 hardcoded `SUPABASE_ANON_KEY` JWTs centralized via `shared/supabase.js` + new `scripts/sync-bos-mirror.sh` helper
- **6a.3** — Auth gate hardened (path-traversal rejection, GET/HEAD method gate, `AUTH_FLOW_PATHS` allowlist)
- **6a.5** — 5 auth routes moved to team subdomain
- **6a.6** — Team Portal + `/logged-in` moved to team. URL collapsed: bare `team.awknranch.com` is the sign-in landing
- **6a.7** — All 39 BOS Admin routes moved to team + new `team/robots.txt` with `Disallow:/`
- **6a.2** — M3: 5 highest-risk operator writes gated server-side via `/api/team/*` (bearer auth + Origin allowlist + Zod validation + role matrix + structured audit logs)
- **6a.8** — `next.config.js` 301 redirects ready for production cutover (no-op locally)
- **6a.9** — Documentation refresh

Plus tonight (post-6a hardening):
- Public AWKN Ranch nav alignment fix (vertical centering of menu + hamburger with right-side links)
- Within Center nav alignment + `trailingSlash: true` to fix relative-link 404s
- Within Center links sweep (`../within-center/` → `https://within.center/`)
- Google Maps CSP allowlist for `/contact` map embed
- Repo restructure — all legacy site content wrapped in top-level `legacy/`; awkn-web-app self-contained for repo split
- Bundled-legacy mirror: `awkn-web-app/legacy/` contains the legacy HTML the app reads at runtime

## Architecture

### Multi-domain routing

`src/proxy.ts` reads the `Host` header, maps to a `DomainKey` (`awknranch | within | portal | team`), and rewrites the path internally to `/<domain>/<rest>`. Browser URLs stay clean; the new app's filesystem layout looks like:

```
src/app/
├── awknranch/(internal)/   → served on awknranch.com
│   └── [11 routes — public site, investor, reference, etc.]
├── within/(internal)/      → served on within.center
│   └── [38 routes — marketing, booking, resources, conditions, etc.]
├── team/(internal)/        → served on team.awknranch.com (auth-gated)
│   ├── [5 auth routes]
│   ├── [3 team-portal routes]
│   └── spaces/admin/       → 39 BOS admin routes
└── api/team/               → 5 server-side endpoints (bearer auth + role gate)
```

Local dev: visit `http://awknranch.localhost:3000`, `http://team.localhost:3000`, etc. Browsers resolve `*.localhost` automatically.

### Legacy passthrough strategy

The 110 ported pages are served verbatim — `serveLegacyHtml()` reads HTML from `legacy/` (bundled into this app) and returns it as a `text/html` Response. The helper supports per-call rewrite modes (`bosPort`, `withinPort`, `legacyAuthPort`, `clinicalPort`) for legacy-URL prefix stripping and asset path rewriting.

This preserves Lauren's HTML-edit workflow: she edits HTML directly, no React rebuild required. The verbatim approach is intentional throughout Phase 6 — React rebuilds happen lazily as forcing functions emerge (audit-log requirements, dynamic content, etc.).

### M3 server-side write gates

5 highest-risk operator writes (role change, user delete, permission reset, payment-link creation, lead delete) route through `/api/team/*` with:

1. **Origin allowlist** — `https://team.awknranch.com`, `http://team.localhost:3000`, Vercel preview URL
2. **Bearer-token auth** — legacy JS reads `supabase.auth.getSession().access_token` from the existing localStorage session and sends it; server validates via `supabase.auth.getUser(token)`
3. **Role matrix** — per-endpoint allowlist (e.g., role-change is `oracle`/`admin` only; payment-link is `oracle`/`admin`/`staff`)
4. **Zod validation** — UUIDs constrained, role values from enum, payment amounts bounded
5. **Structured audit log** — JSON line per call captured by Vercel function logs (persistent table is Phase 6b)
6. **Service-role mutation** — escalates to service-role Supabase client for the actual privileged write

Self-protection: role-change and user-delete reject requests where caller's `app_user_id` matches target (no self-demote, no self-delete).

## Feature status

| Area | State | Notes |
|---|---|---|
| Multi-domain proxy | ✅ Live | `*.localhost` auto-resolution + hostname → route-folder rewrite |
| Public AWKN Ranch site (8 pages) | ✅ Live | Lauren's redesign, verbatim port. Forms are mailto-only (see TODO) |
| Within Center site (38 pages) | ✅ Live | Verbatim port. Booking page uses separate Supabase (flagged) |
| BOS Admin (39 pages) | ✅ Live | All on team subdomain, auth-gated |
| M3 server-side gates | ✅ Live | 5 endpoints; bearer auth + Origin + Zod |
| Auth gate hardening | ✅ Live | Path-traversal rejection + method gate |
| Trailing-slash routing | ✅ Live | `trailingSlash: true` matches legacy GH-Pages convention |
| SignWell webhook | ✅ Wired | env-key based (was reading missing config table); E2E test pending |
| Cloudflare R2 storage | ✅ Retired | Vercel Blob will replace if needed |
| Database (Drizzle + Supabase) | ✅ Live | 72-table schema introspected from prod |
| Auth (Supabase) | ✅ Live | Cookie-based via `@supabase/ssr` for new app; legacy localStorage bridge for ported pages |

## Known limitations

- **Multi-domain auth bridging** — new app's `@supabase/ssr` cookie auth and legacy `localStorage[awkn-ranch-auth]` are independent. Bearer token from legacy is what wires M3 endpoints. Cookie unification is Phase 6b.
- **Within Center separate Supabase** — `within.center/book/` POSTs to `gatsnhekviqooafddzey.supabase.co`, distinct from AWKN's `lnqxarwqckpmirpmixcw`. Stakeholder decision required (see TODO).
- **Public-form scaffolding** — 3 AWKN public forms (book, host-a-retreat, contact) and 1 within form (contact via formsubmit.co) are all NOT wired to the BOS CRM. Email-only delivery today. (See TODO.)
- **Within email templates publicly exposed** — `within.center/emails/{deposit-received,ketamine-prep}/` are operator-side previews accidentally on the public site. Indexable. (See TODO.)
- **No production analytics** — CSP doesn't allow GA/Pixel/etc. Vercel Analytics or Plausible would need explicit allowlist.
- **`checkJs: true` errors in legacy public/JS** — Pre-existing TypeScript noise from legacy admin JS files mirrored under `public/`. Doesn't break runtime; build's typecheck step fails. Cleanup is Phase 6b.

## Recent changes (last 5 sessions)

| Date | Change | Author |
|---|---|---|
| 2026-05-06 | **Self-contained repo prep + nav/routing/CSP polish.** All legacy site content wrapped in top-level `legacy/`; awkn-web-app bundles its own `legacy/` mirror via `scripts/sync-legacy.sh`. Tonight's polish: Within nav alignment (same fix as awknranch), `trailingSlash: true` to fix Within relative-link 404s, Within→within.center link sweep, Google Maps CSP, dev-landing flicker fix, public docs flagged for forms + email templates + Within Supabase consolidation. | Miceli |
| 2026-05-06 | **Phase 6a local implementation complete.** 9 commits — Associates retired, M2 (12 hardcoded JWTs centralized), auth gate hardened, 47 team-facing routes moved (5 auth + 3 portal + 39 BOS admin), team/robots.txt, M3 (5 server-side gated risky writes with bearer auth + Origin + Zod + role matrix + audit logs), next.config.js production redirects ready. | Miceli |
| 2026-05-06 | **Plan + audit + integrations cleanup.** Phase 6a spec drafted, Codex-audited (30 issues, 29 incorporated), revised to v2. Earlier: SignWell webhook fixed (env-key based), R2 retired (Vercel Blob future replacement), within-center separate Supabase flagged for stakeholder. | Miceli |
| 2026-05-06 | **Main merge + Phase 6 kickoff.** 12 net-new commits factored in from `origin/main` (Lauren's public site rebuild — 8 new pages + portal restructure; Justin's invoice flow with Stripe + 2 SQL migrations). `.env.example` salvaged from prod secrets, public spaces application surface retired, `bos` → `team` domain rename. | Miceli |
| 2026-05-05 | **Phase 3 audit-driven port:** 12 legacy pages ported into awkn-web-app via verbatim Route Handlers under `(internal)` route group. Functional `/login` with legacy session bridge. Dev landing tracks port progress nested per-domain. | Miceli |

## Documentation map

This app is intended to stand on its own as a GitHub repo. Key docs inside this directory:

- **README.md** — getting started for new contributors
- **STATUS.md** — this file
- **TODO.md** — open work, organized by priority
- **ROADMAP.md** — two tracks: refactoring (continuous improvement) + feature implementation
- **CLAUDE.md** — project directives for AI-assisted development
- **.env.example** — full env-var inventory mapped to vault locations

When this app moves to its own repo, all the above travel with it.
