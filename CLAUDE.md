# AWKN — Project Directives

AWKN is a bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — wellness retreat property in Austin (currently `awknranch.com` on Squarespace)
- **Within Center** — clinical brand for ketamine/inpatient retreats (currently `within.center` on WordPress)

Single integrated business. The admin BOS at `/spaces/admin/` is the source of truth for both. Long-term plan + Next.js migration scope: see `docs/ECOSYSTEM-MAP.md`.

## On-demand docs (load only when the task matches)

- `docs/ECOSYSTEM-MAP.md` — **load for:** architecture decisions, scope questions, "where does X belong"
- `docs/CREDENTIALS.md` — **load for:** SQL queries, deploying functions, SSH, API calls
- `docs/SCHEMA.md` — **load for:** writing queries, modifying tables, debugging data
- `docs/PATTERNS.md` — **load for:** writing UI code, Tailwind styling, code review, testing
- `docs/KEY-FILES.md` — **load for:** finding files, understanding project structure
- `docs/DEPLOY.md` — **load for:** pushing, deploying, version questions
- `docs/INTEGRATIONS.md` — **load for:** external APIs, vendor setup, pricing
- `docs/CHANGELOG.md` — **load for:** understanding recent changes, migration context
- `docs/SECRETS-BITWARDEN.md` — **load for:** Bitwarden CLI, secrets management, vault organization, sharing credentials
- `docs/OPEN-BRAIN-SETUP.md` — **load for:** Open Brain session dashboard, AI memory, embeddings

## Multi-dev branch convention

This is a multi-developer project. Each dev commits to their **own named branch** (e.g. `miceli`), pushes to remote, opens a PR into `main` for review. Never commit directly to `main`. Branches in flight are personal workspaces — only the owner pushes to them.

## Vestigial scope — DO NOT EXTEND

The codebase was forked from `rsonnad/alpacapps-infra` (originally an AlpacaPlayhouse tenant-IoT seed). Roughly 30% of the code is leftover from that and **is not in AWKN scope**. Scheduled for deletion. Do not add features, fix bugs, or extend anything in:

- `/residents/` — tenant IoT control surfaces
- Anything named `govee_*`, `nest_*`, `tesla_*`, `lg_*`, `anova_*`, `glowforge_*`, `flashforge_*`, `printer_*`, `sonos_*`, `camera_streams_*`, `go2rtc_*`
- Home-server LAN bridge (Tailscale)
- IoT workers on the DigitalOcean droplet (`tesla-poller`, `lg-poller`)
- `.next/` or `/out/` directories at repo root (ghost of an abandoned Next.js attempt; will be purged)

If a task touches one of these, stop and surface the question before proceeding.

## Pillar model (mid-refactor — be aware)

The IA is being reorganized around four business pillars: **Ranch / Within / Retreat / Venue.** Pages and tables are being consolidated against this model. When in doubt, ask which pillar a feature belongs to before placing it.

## Mandatory Behaviors

1. After code changes: end response with `vYYMMDD.NN H:MMa [model]` + affected URLs (read `version.json`)
2. Push immediately — GitHub Pages deploys on push to `main`. See `docs/DEPLOY.md`. (PR-first on multi-dev branches.)
3. CI bumps version — never bump locally
4. Run SQL migrations directly — never ask the user to run SQL manually

## Code Guards

- Filter archived items: `.filter(s => !s.is_archived)` client-side
- No personal info in consumer/public views
- `showToast()` not `alert()` in admin
- `openLightbox(url)` for images
- Tailwind: use design tokens from `@theme` block (see `docs/PATTERNS.md`). Run `npm run css:build` after new classes.

## Quick Refs

- **Tech:** Vanilla HTML/JS + Tailwind v4 | Supabase (Postgres + Auth + Storage + Edge Functions) | GitHub Pages
- **Live:** https://laurenbur2.github.io/awkn-ranch/
- **Architecture:** Browser → GitHub Pages → Supabase (no server-side framework code; integrations run on Supabase edge functions and a DigitalOcean droplet)
- **Public sites:** awknranch.com (Squarespace, planned Next.js migration), within.center (WordPress, planned Next.js migration)
- **External services in scope:** Stripe, Square, PayPal, Resend, Telnyx, Meta WhatsApp, SignWell, Vapi, Gemini, Brave Search, Tellescope (Within HIPAA portal)
