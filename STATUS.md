# AWKN — Status (legacy repo)

**Last Updated:** 2026-05-06
**Last Updated By:** Matthew Miceli

> ⚠️ **This doc covers the legacy repo at `laurenbur2/awkn-ranch`.** For the active Next.js app, see [`awkn-web-app/STATUS.md`](./awkn-web-app/STATUS.md). The web app is being moved to its own GitHub repo; this doc captures the historical project arc + state of the legacy GH-Pages site.

## What this repo is

The original AlpacaPlayhouse-template fork that became the AWKN Business Operating System + GH-Pages public site. After Phase 6a (2026-05-06), the active Next.js app moved into the `awkn-web-app/` subfolder, and all legacy site content was wrapped into `legacy/`.

```
/AWKN/
├── awkn-web-app/        ← active development (Next.js app, → moving to its own repo)
├── legacy/              ← legacy GH-Pages site content (HTML, JS, Supabase functions)
├── docs/                ← historical project documentation
└── (project meta)       ← CLAUDE.md, STATUS.md, TODO.md, README.md, LICENSE
```

## Phases (program arc)

| Phase | Status | Summary |
|---|---|---|
| Phase 0 | ✅ | Branch reset to known-good baseline |
| Phase 1 | ✅ | Alpaca purge — ~50k+ LOC removed across 6 passes |
| Phase 2 | ✅ | Next.js scaffold + Drizzle + Supabase Auth (cookie-based) |
| Phase 3 | ✅ | Audit-driven port — 110 legacy pages ported via verbatim Route Handlers |
| Phase 6a | ✅ (local) | Team subdomain consolidation + M2 (centralized JWTs) + M3 (server-side gated risky writes) |
| Phase 6a-Deploy | ⏳ | Vercel + DNS production cutover. Awaits awkn-web-app repo split. |
| Phase 6b | 📋 | Long-game React rebuild + infra modernization on a separate dev branch |

## Repo split — imminent

`awkn-web-app/` is being moved to its own GitHub repo + Vercel project. Everything inside that subfolder is self-contained:

- All source code
- Full doc set (STATUS, TODO, ROADMAP, CLAUDE, README, LICENSE)
- Bundled legacy HTML/JS at `awkn-web-app/legacy/` (read at runtime)
- Public asset mirrors at `awkn-web-app/public/`
- Sync scripts to refresh from upstream legacy

After the split:
- This repo continues to exist as the legacy GH-Pages source for Lauren and Justin to edit content
- The new repo deploys to Vercel and serves the multi-domain Next.js app
- Sync flow: changes to `legacy/` here → operator runs `./scripts/sync-legacy.sh <path>` in the new repo → push → Vercel auto-deploys

## What's in the legacy site (this repo)

| Surface | Role | Status |
|---|---|---|
| AWKN Ranch public site (legacy) | Continues serving via GH Pages until DNS cuts to Vercel | Active |
| BOS at `/legacy/spaces/admin/` | Source of truth for BOS HTML — Lauren/Justin edit here | Active |
| Within Center site | Continues serving via GH Pages until DNS cuts to Vercel | Active |
| Supabase edge functions | Deployed independently to Supabase | Active |
| Supabase migrations | DB schema source of truth in `legacy/supabase/migrations/` | Active |

## Decommissioning (deferred until end-of-program)

Single prod-write event after the new app is live + stable. Captured in detail in the Phase 6a spec ([`awkn-web-app/docs/superpowers/specs/2026-05-07-phase-6a-team-subdomain-migration.md`](./awkn-web-app/docs/superpowers/specs/2026-05-07-phase-6a-team-subdomain-migration.md)).

- 6 prod edge functions to undeploy: `vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`, `guestbook-upload`
- DigitalOcean droplet IoT pollers (`tesla-poller`, `lg-poller`) — needs SSH config first
- Dormant Supabase Functions env vars on undeployed functions, plus the 5 R2_* secrets

## Recent program milestones

| Date | Milestone |
|---|---|
| 2026-05-06 | Phase 6a local complete — team subdomain consolidation + M2 + M3 + repo restructure. awkn-web-app prepared to split to its own repo. |
| 2026-05-06 | Justin shipped Stripe invoice flow + branded `invoice_sent` email + 2 SQL migrations |
| 2026-05-06 | Lauren shipped public AWKN Ranch site (8 new pages + portal restructure) |
| 2026-05-05 | Phase 3 audit-driven port — 12 initial pages, expanded to 110 by 2026-05-06 |
| 2026-05-04 | Phase 2 complete — Next.js scaffold, Drizzle introspect, Supabase Auth, multi-domain proxy |
| 2026-05-03 | Phase 1 complete — Alpaca purge across 6 passes |

## Where to look next

- Active development → [`awkn-web-app/STATUS.md`](./awkn-web-app/STATUS.md)
- Open work for the new app → [`awkn-web-app/TODO.md`](./awkn-web-app/TODO.md)
- Long-term direction → [`awkn-web-app/ROADMAP.md`](./awkn-web-app/ROADMAP.md)
- Phase 6a implementation spec → [`awkn-web-app/docs/superpowers/specs/2026-05-07-phase-6a-team-subdomain-migration.md`](./awkn-web-app/docs/superpowers/specs/2026-05-07-phase-6a-team-subdomain-migration.md)
- Legacy site editing → `legacy/` (Lauren and Justin's content lives here)
