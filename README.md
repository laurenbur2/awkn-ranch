# AWKN

Bespoke Business Operating System (BOS) backing two consumer brands:

- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`)

The admin BOS at `/spaces/admin/` is the source of truth for both. Long-term plan and Next.js migration scope: see [`docs/ECOSYSTEM-MAP.md`](docs/ECOSYSTEM-MAP.md).

## Architecture

```
Browser → GitHub Pages (static HTML/JS/CSS)
              ↓
       Supabase (Postgres + Auth + Storage + Edge Functions)
```

- **Frontend:** Vanilla HTML/JS + Tailwind CSS v4
- **Backend:** Supabase (edge functions, RLS, JWT auth)
- **Hosting:** GitHub Pages — no build step, push to deploy
- **Mobile:** Capacitor 8 (iOS + Android wrapper)

## Project structure

```
spaces/        Public spaces + admin BOS (CRM, Master Schedule, Venue, Proposals)
associates/    Staff hours tracking + work photos
login/         Authentication pages
shared/        JS modules (auth, services, shells, widgets)
styles/        Tailwind v4 design tokens
supabase/
  functions/   Edge functions
  migrations/  Database migrations
mobile/        Capacitor iOS/Android app
infra/         AWKN Ranch infra setup wizard
docs/          Project documentation (load on demand per CLAUDE.md)
```

## Documentation

- [`CLAUDE.md`](CLAUDE.md) — project directives + on-demand doc routing for Claude Code
- [`STATUS.md`](STATUS.md) — current feature status + recent changes
- [`TODO.md`](TODO.md) — tracked work items (Critical / Bugs / Tech Debt / Enhancements)
- [`docs/ECOSYSTEM-MAP.md`](docs/ECOSYSTEM-MAP.md) — architecture, surface inventory, Next.js migration plan
- `docs/SCHEMA.md`, `docs/PATTERNS.md`, `docs/INTEGRATIONS.md`, `docs/KEY-FILES.md`, `docs/DEPLOY.md` — feature-specific docs, load when relevant

## Workflow

Multi-developer project. Each dev commits to their **own named branch** (e.g. `miceli`), pushes to remote, opens a PR into `main` for review. Never commit directly to `main`.

CI bumps the version on push to `main` — never bump locally.

## License

Proprietary — see [LICENSE](LICENSE). All rights reserved.
