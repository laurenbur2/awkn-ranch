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

**Phase 0** ✅ complete. **Phase 1** in progress: **Pass 1 ✅ complete** (inventory manifest + gitignore); **Pass 2 next**.

**Branching model:** `miceli` is the long-lived workspace where the entire transformation lives. Work commits directly to `miceli` — no per-phase sub-branches (overrides program spec §4 Decision 8). Periodic `git pull origin main` ingests teammate work; do NOT push `miceli` → `main` during the program.

**DB strategy:** zero prod DB writes during Phase 1. Local Postgres clone via `supabase start` becomes the dev target through Phases 2-6. Prod gets touched once at end-of-program cutover against the crystallized schema (overrides program spec §4 Decision 7).

## Feature Status

| Area | State | Notes |
|---|---|---|
| Admin BOS (CRM, Master Schedule, Venue Spaces, Proposals) | ✅ Live | ~25-30 real AWKN pages |
| Voice / PAI / Vapi | 🔴 Decommission planned | Wholesale removal in Phase 1 Pass 4 (CTO confirmed 2026-05-03) |
| Payments (Stripe + Square + PayPal) | ✅ Live | Untested — no CI gates on money flows |
| AlpacaPlayhouse residue (`/residents/`, IoT) | 🔴 Removal in progress | Phase 1 Pass 1 inventory complete; Pass 2 deletes ~37k LOC |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress; Phases 3-4 migration |
| Client portal | ⏳ Not built | Phase 5 greenfield |

## Known Limitations

- ~30% of codebase is AlpacaPlayhouse residue — Pass 1 inventory manifest at `docs/superpowers/work/2026-05-03-alpaca-inventory.md` catalogs 149 unique files (~37k LOC) for Pass 2-4 removal.
- No tests, no TypeScript, no CI gates on money handlers — addressed incrementally as each phase touches the relevant code.
- Build artifacts `/.next/` and `/out/` still tracked in git — gitignored 2026-05-03; Pass 2 Category 5 untracks + deletes.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) being introduced; events/schedule pages overlap. Should freeze before Phase 6. Pass 3 tags each page with its pillar as it audits.

## Recent Changes (last 5)

| Date | Change | Author |
|---|---|---|
| 2026-05-03 | Phase 1 Pass 1 complete: 531-line alpaca inventory manifest + gitignore updates (154a1f59) | Miceli |
| 2026-05-03 | Phase 1 implementation plan: 1824 lines, ~40 tasks across 6 passes (bc791a13) | Miceli |
| 2026-05-03 | Phase 1 design spec — refines program spec §7 + Decisions 7+8 (ecd1ee73) | Miceli |
| 2026-05-03 | Merged 47 teammate commits from origin/main: Within Center pages, Master Calendar, retreat sessions (6a557556) | Justin/Lauren via merge |
| 2026-05-01 | Phase 0 complete: miceli reset to origin/main, AWKN docs + program spec restored (0fb33b6) | Miceli |
