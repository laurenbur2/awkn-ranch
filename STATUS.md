# AWKN — Status

**Last Updated:** 2026-05-03
**Last Updated By:** Matthew Miceli (`miceli`)

## Project Overview

Bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`, Squarespace today)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`, WordPress today)

Single integrated business. Admin BOS at `/spaces/admin/` is the source of truth.

Architecture, surface inventory, Next.js migration plan, and deletion manifest live in `docs/ECOSYSTEM-MAP.md`.

## Active program

**8-phase cleanup + Next.js refactor** in flight on `miceli`.

- Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
- Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-05-03-phase-1-alpaca-purge.md`

**Phase 0** ✅ complete. **Phase 1 Pass 1** ✅ complete. **Pass 2** in progress (~85% done): Tier 1 deletions ✅, Tier 2 surgery mostly ✅, hot spots remaining (`feature-manifest.json`, `spaces/admin/inventory.js`, `property-ai/index.ts`), prod undeploy (Task 2.11) pending.

**Branching model:** `miceli` is the long-lived workspace where the entire transformation lives. Work commits directly to `miceli` — no per-phase sub-branches (overrides program spec §4 Decision 8). Periodic `git pull origin main` ingests teammate work; do NOT push `miceli` → `main` during the program.

**DB strategy:** zero prod DB writes during Phase 1. Local Postgres clone via `supabase start` becomes the dev target through Phases 2-6. Prod gets touched once at end-of-program cutover against the crystallized schema (overrides program spec §4 Decision 7). **Read-only** prod queries via `supabase db query --linked` are allowed and have been used during Pass 2 audits.

## Feature Status

| Area | State | Notes |
|---|---|---|
| Admin BOS (CRM, Master Schedule, Venue Spaces, Proposals) | ✅ Live | ~25-30 real AWKN pages |
| Voice / PAI / Vapi | 🔴 Decommission planned | Wholesale removal in Phase 1 Pass 4 (CTO confirmed 2026-05-03) |
| Payments (Stripe + Square + PayPal) | ✅ Live | Untested — no CI gates on money flows. Stripe `create-payment-link` configured but 0 payments processed. |
| SignWell webhook | 🟡 Empirically dead | Missing tables in prod; CTO question whether to delete or keep dormant |
| AlpacaPlayhouse residue (`/residents/`, IoT) | ✅ Mostly removed | Pass 2 deleted ~38k LOC. Hot spots (property-ai IoT loaders, admin inventory.js) remain. |
| Mobile app (`mobile/`) | 🟡 100% IoT | Has never shipped. CTO question whether to delete or preserve scaffolding. |
| `/directory/` page | 🟡 Phase 5 scaffolding | Schema mismatch in prod (app_users missing slug/bio/etc.); preserved for client portal rebuild |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress; Phases 3-4 migration |
| Client portal | ⏳ Not built | Phase 5 greenfield |

## Known Limitations

- ~30% of codebase was AlpacaPlayhouse residue — Pass 2 has removed ~38k LOC (1928 files) so far. Remaining: Pass 4 Vapi/PAI decommission + a few hot spots.
- No tests, no TypeScript, no CI gates on money handlers — addressed incrementally as each phase touches the relevant code.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) being introduced; events/schedule pages overlap. Should freeze before Phase 6. Pass 3 tags each page with its pillar as it audits.
- AWKN profile system (`/directory/`) has a schema gap — `app_users` is missing the columns the page queries (`slug`, `bio`, `pronouns`, etc.). Phase 5 will close the gap.

## Recent Changes (last 5)

| Date | Change | Author |
|---|---|---|
| 2026-05-03 | Phase 1 Pass 2 ~85% complete: Tier 1 bulk deletes (build artifacts, /residents/, IoT pollers + edge functions, macOS dupes), Tier 2 surgery (login redirects, profile.html refs, shared shells, 24 admin context-switchers, 404 cleanup, branding rename, README + LICENSE rewrite, home-assistant-control delete). 17 commits, ~38k LOC removed. (`6267b816` → `a2cce3cd`) | Miceli |
| 2026-05-03 | Empirical prod-DB audit via Supabase Management API: zero users with role=resident/associate; SignWell tables mostly missing; 0 stripe_payments ever; app_users schema mismatched with /directory/ query | Miceli |
| 2026-05-03 | 4 manifest reclassifications: `/directory/`, `infra/`, `shared/resident-shell.js` as KEEP/Phase 5 scaffolding; `mobile/` escalated to CTO question | Miceli |
| 2026-05-03 | Phase 1 Pass 1 complete: 531-line alpaca inventory manifest + gitignore updates (154a1f59) | Miceli |
| 2026-05-03 | Merged 47 teammate commits from origin/main: Within Center pages, Master Calendar, retreat sessions (6a557556) | Justin/Lauren via merge |
