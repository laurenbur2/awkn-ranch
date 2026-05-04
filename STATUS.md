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

**Phase 0** ✅ complete. **Phase 1 Pass 1** ✅ complete. **Phase 1 Pass 2** ✅ functionally complete: Tier 1 deletions ✅, Tier 2 surgery ✅, `mobile/` ✅, `feature-manifest.json` + setup wizard skill ✅, `spaces/admin/inventory.{html,js}` ✅. The third Pass 2 hot spot `property-ai/index.ts` (4019 lines) is reclassified to Pass 4 wholesale delete — PAI is moot per CTO 2026-05-03, the whole edge function dies with Vapi decommission, so surgical IoT-stripping in Pass 2 would be wasted effort. Prod undeploy (Task 2.11) deferred to end-of-program cutover per prod-discipline rule.

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
| Mobile app (`mobile/`) | ✅ Deleted 2026-05-03 | 1.1MB Capacitor 8 + iOS + Android, 100% IoT, never shipped. CTO confirmed delete. |
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
| 2026-05-03 | Pass 3 chunk 4 (CRM/sales cluster — `crm`, `clients`, `packages`, `purchases`, `memberships`) audited: zero deletions. All 5 mainline AWKN. Tech-debt flagged for separate cleanup: 6 hardcoded SUPABASE_ANON_KEY JWTs in `crm.js` + `clients.js` should import from `shared/supabase.js`. | Miceli |
| 2026-05-03 | Pass 3 chunk 3 (Operations cluster — `rentals`, `spaces`, `projects`, `highlights-order`) audited: zero deletions. All 4 mainline AWKN ops pages preserved. `spaces.html` is another intentional legacy redirect; rentals (4504 LOC), projects (1040 LOC), highlights-order are real AWKN admin pages with no IoT residue. | Miceli |
| 2026-05-03 | Pass 3 chunk 2 (Internal/dev cluster — `appdev`, `testdev`, `devcontrol`, `phyprop`, `manage`) audited: zero deletions. All 5 pages tagged Cross-cutting/Ranch and preserved. testdev/devcontrol/manage are intentional legacy redirects (Justin's `0dfd75a4` retirement work); phyprop is a real AWKN physical-property dashboard (527 lines of parcels/structures/zoning); appdev is the AI dev console deferred to agentic-systems pause. | Miceli |
| 2026-05-03 | Pass 3 chunk 1 (PAI/Vapi cluster) audited: `lifeofpaiadmin.html` deleted (was a broken redirect to a Pass-2-deleted page). 4 sibling pages tagged for Pass 4 disposition (`ai-admin`, `pai-imagery`, `voice` → wholesale, `faq` → surgery). Reference cleanup across `admin-shell.js`, `associate-shell.js`, `resident-shell.js`, `users.js` — `admin_pai_settings` perm fully removed. New deliverable: `docs/superpowers/work/2026-05-03-page-pillar-tags.md`. | Miceli |
| 2026-05-03 | Pass 2 declared functionally complete. `property-ai/index.ts` (4019 lines) reclassified from Pass 2 hot spot to Pass 4 wholesale delete (PAI moot, dies with Vapi). Task 2.11 (prod IoT undeploy) deferred to end-of-program cutover per prod-discipline rule. | Miceli |
| 2026-05-03 | `spaces/admin/inventory.{html,js}` deleted (523-line page documenting Alpuca Mac, AlpacaPlayhouse infra, Rahul's GDrive/Tesla dashcam — zero AWKN content). Already `_hidden`. Companion edits: removed `view_inventory` perm + icon + tab in `shared/admin-shell.js`, removed Inventory quick-action in `spaces/admin/dashboard.js`. | Miceli |
| 2026-05-03 | `feature-manifest.json` (515-line alpaca setup-wizard manifest) deleted along with the `setup-alpacapps-infra` skill (`.claude/skills/setup-alpacapps-infra/`). CTO decision: delete entirely vs. strip IoT/Vapi — the manifest had no AWKN runtime consumer. Reference cleanup in `CUSTOMIZATION.md` §4 + checklist, `supabase/functions/_shared/api-permissions.ts` comment, `docs/ECOSYSTEM-MAP.md`. | Miceli |
| 2026-05-03 | `mobile/` directory deleted (1.1MB Capacitor 8 + iOS + Android, 100% IoT, never shipped). Companion alpaca-skill `mobile-setup.md` reference removed. Doc references stripped from README, CUSTOMIZATION, PATTERNS, KEY-FILES, ECOSYSTEM-MAP. Resolves CTO question #4. | Miceli |
| 2026-05-03 | Phase 1 Pass 2 ~85% complete: Tier 1 bulk deletes (build artifacts, /residents/, IoT pollers + edge functions, macOS dupes), Tier 2 surgery (login redirects, profile.html refs, shared shells, 24 admin context-switchers, 404 cleanup, branding rename, README + LICENSE rewrite, home-assistant-control delete). 17 commits, ~38k LOC removed. (`6267b816` → `a2cce3cd`) | Miceli |
| 2026-05-03 | Empirical prod-DB audit via Supabase Management API: zero users with role=resident/associate; SignWell tables mostly missing; 0 stripe_payments ever; app_users schema mismatched with /directory/ query | Miceli |
| 2026-05-03 | 4 manifest reclassifications: `/directory/`, `infra/`, `shared/resident-shell.js` as KEEP/Phase 5 scaffolding; `mobile/` escalated to CTO question | Miceli |
| 2026-05-03 | Phase 1 Pass 1 complete: 531-line alpaca inventory manifest + gitignore updates (154a1f59) | Miceli |
| 2026-05-03 | Merged 47 teammate commits from origin/main: Within Center pages, Master Calendar, retreat sessions (6a557556) | Justin/Lauren via merge |
