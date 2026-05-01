# AWKN — Status

**Last Updated:** 2026-04-28
**Last Updated By:** Matthew Miceli (`miceli`)

## Project Overview

Bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`, Squarespace today)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`, WordPress today)

Single integrated business. Admin BOS at `/spaces/admin/` is the source of truth.

Architecture, surface inventory, Next.js migration plan, and deletion manifest live in `docs/ECOSYSTEM-MAP.md`.

## Feature Status

| Area | State | Notes |
|---|---|---|
| Admin BOS (CRM, Master Schedule, Venue Spaces, Proposals) | ✅ Live | ~25-30 real AWKN pages |
| Voice / PAI / Vapi | ✅ Live | Currently still references IoT inventory in prompts (needs rewrite, see TODO) |
| Payments (Stripe + Square + PayPal) | ✅ Live | Untested — no CI gates on money flows |
| AlpacaPlayhouse residue (`/residents/`, IoT) | 🔴 Vestigial | Scheduled for deletion (~100 files, ~53k lines) |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress, planned Next.js migrations |
| Client portal | ⏳ Not built | Greenfield, Next.js, MVP scoped in ECOSYSTEM-MAP.md |

## Known Limitations

- ~30% of codebase is AlpacaPlayhouse residue with deep cross-refs (login default page, Stripe redirects, SignWell email URLs, PAI system prompt). Surgery required before deletion. See `docs/ECOSYSTEM-MAP.md` and TODO.md.
- 26 commits on `miceli` not yet on `main` (deploy stale since 2026-04-02).
- No tests, no TypeScript, no CI gates on money handlers.
- Build artifacts `/.next/` and `/out/` tracked in git from a prior abandoned Next.js attempt.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) being introduced; events/schedule pages overlap.

## Recent Changes (last 5)

| Date | Change | Author |
|---|---|---|
| 2026-04-28 | Customize CLAUDE.md for AWKN, mark alpaca residue as vestigial (5791071) | Miceli |
| 2026-04-28 | AWKN ecosystem map — surface inventory, Next.js fit, phased roadmap (bdf5ed2) | Miceli |
| (prior)    | CRM: Venue Space selector on proposal modal — syncs to lead.space_id (6a76e09) | (prior) |
| (prior)    | Master Schedule: revert House Stays redirect — keep all 4 subtabs (4c73601) | (prior) |
| (prior)    | Venue calendars: only show confirmed bookings (657975b) | (prior) |
