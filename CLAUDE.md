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

## Vestigial scope (Phase 1 purge — complete)

Codebase was forked from `rsonnad/alpacapps-infra` (originally an AlpacaPlayhouse tenant-IoT seed). Phase 1 removed ~46k LOC of residue across 6 passes. **If you encounter remaining references, surface them — they are leftovers, not active scope.** Decommissioned categories:

- `/residents/` tenant IoT control surfaces (deleted Pass 2)
- All IoT integrations: Govee, Nest, Tesla, Sonos, LG ThinQ, Anova, Glowforge, FlashForge, UniFi cameras, go2rtc, Spotify (deleted Pass 2 + Pass 6)
- Home-server LAN bridge (Tailscale)
- DigitalOcean droplet IoT pollers (`tesla-poller`, `lg-poller`) — deferred to end-of-program cutover
- Vapi voice AI + PAI Discord bot + `property-ai` edge function (deleted Pass 4)
- Hostinger OpenClaw multi-channel chatbot (deleted Pass 6)
- Mobile app (Capacitor) — deleted Pass 2
- Template-system scaffolding (`infra/`, `setup-alpacapps-infra` skill, `update-checker.js`, `CUSTOMIZATION.md`) — deleted Pass 6
- 5 deployed edge functions still need undeployment from prod at end-of-program cutover (`vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`)

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
- **External services in scope:** Stripe, Square, PayPal, Resend, Telnyx, Meta WhatsApp, SignWell, Gemini, Brave Search, Tellescope (Within HIPAA portal)
