# AWKN — TODO (legacy repo)

> ⚠️ **This doc covers the legacy repo at `laurenbur2/awkn-ranch`.** For active app work, see [`awkn-web-app/TODO.md`](./awkn-web-app/TODO.md).

## What lives here

This file tracks work specific to the **legacy GH-Pages site** + the broader project arc. App-specific work has moved to `awkn-web-app/TODO.md` since `awkn-web-app/` is being split into its own GitHub repo.

## Legacy-side open work

- [ ] **Lauren / Justin continue editing legacy content** — site content edits happen here in `legacy/`. After each batch of changes, the operator running awkn-web-app should run `./scripts/sync-legacy.sh <path>` in the new repo to refresh the bundled mirror, then push to trigger a Vercel deploy.

- [ ] **`/directory/` historical intent** — AWKN scaffolding for client profiles, or partially-rebranded residue? Preserve regardless; answer informs Phase 5 build in the new app.

## Pre-existing process directives (still in effect)

- **No prod DB writes during refactor** — read-only via `supabase db query --linked` + `drizzle-kit pull`
- **Strategic well-scoped commits** — work directly on personal branches (e.g., `miceli`), no per-phase sub-branches
- **Never merge to main without explicit user permission** — main is the user's gate

## Decommissioning (end-of-program cutover)

Single prod-write event after the new app is live + stable. Detailed runbook: `legacy/docs/migrations/2026-05-04-prod-cleanup-runbook.md`.

- [ ] Undeploy 6 prod edge functions: `vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`, `guestbook-upload`
- [ ] Stop droplet IoT pollers (`tesla-poller`, `lg-poller`) — needs SSH config
- [ ] Drop dormant Supabase Functions env vars on undeployed functions

## Active feature/refactor work — see `awkn-web-app/`

All app-specific TODOs live in [`awkn-web-app/TODO.md`](./awkn-web-app/TODO.md):

- Phase 6a-Deploy production cutover prerequisites
- Stakeholder discussion items (form-to-CRM, Within Supabase consolidation, email templates)
- Tech debt (audit log persistence, cookie auth, Phase-2 RouteStub cleanup)
- Long-term roadmap → [`awkn-web-app/ROADMAP.md`](./awkn-web-app/ROADMAP.md) — two tracks: features + refactoring
