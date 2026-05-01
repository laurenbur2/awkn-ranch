# AWKN — Status

**Last Updated:** 2026-05-01
**Last Updated By:** Matthew Miceli (`miceli`)

## Project Overview

Bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`, Squarespace today)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`, WordPress today)

Single integrated business. Admin BOS at `/spaces/admin/` is the source of truth.

Architecture, surface inventory, Next.js migration plan, and deletion manifest live in `docs/ECOSYSTEM-MAP.md`.

## Active program

**8-phase cleanup + Next.js refactor** in flight on `miceli`. Spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`. Phase 0 complete; Phase 1 next.

**Branching model for this program:** `miceli` is the long-lived workspace where the entire transformation lives. `main` is read-only baseline (ingest teammate work via `git pull`; do NOT PR refactor work back to `main` during the program). Periodic `git pull origin main` keeps miceli current with team work like Justin's `8d9cfe2` venue-events commit.

## Feature Status

| Area | State | Notes |
|---|---|---|
| Admin BOS (CRM, Master Schedule, Venue Spaces, Proposals) | ✅ Live | ~25-30 real AWKN pages |
| Voice / PAI / Vapi | ⏳ Decommission approved | Phase 1 Pass 4 (pending ops-lead final confirmation) |
| Payments (Stripe + Square + PayPal) | ✅ Live | Untested — no CI gates on money flows |
| AlpacaPlayhouse residue (`/residents/`, IoT) | 🔴 Vestigial | Phase 1 (~100 files, ~53k lines) |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress; Phases 3-4 migration |
| Client portal | ⏳ Not built | Phase 5 greenfield |

## Known Limitations

- ~30% of codebase is AlpacaPlayhouse residue with deep cross-refs (login default page, Stripe redirects, SignWell email URLs, PAI system prompt). Phase 1 surfaces these via page-by-page audit.
- No tests, no TypeScript, no CI gates on money handlers — addressed incrementally as each phase touches the relevant code.
- Build artifacts `/.next/` and `/out/` tracked in git from a prior abandoned Next.js attempt — Phase 1 Pass 1 removes.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) being introduced; events/schedule pages overlap. Should freeze before Phase 6.

## Recent Changes (last 5)

| Date | Change | Author |
|---|---|---|
| 2026-05-01 | Phase 0 complete: miceli reset to origin/main, AWKN docs + program spec restored (0fb33b6) | Miceli |
| 2026-05-01 | Program-level spec: 8-phase cleanup + Next.js refactor (folded into 0fb33b6) | Miceli |
| 2026-05-01 | Venue events: multi-space + date range + import 64 events from master sheet (8d9cfe2) | Justin DeLaCruz |
| 2026-04-28 | AWKN ecosystem map — surface inventory, Next.js fit, phased roadmap (in 0fb33b6) | Miceli |
| 2026-04-28 | Customize CLAUDE.md for AWKN, mark alpaca residue as vestigial (in 0fb33b6) | Miceli |
