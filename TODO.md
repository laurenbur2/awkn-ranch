# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Latest plan: `docs/superpowers/plans/2026-05-01-phase-0-branch-reset.md` (Phase 0 ✅ complete)

## Critical (blocks production)

### Spec amendment (do at start of Phase 1)
- [ ] Spec §4 Decision 8 currently says "miceli periodically PRs to main." Per the actual model, miceli does NOT PR to main during this program. Single-line edit on Phase 1's first commit.

### Phase 1 prerequisites — CTO answers needed before purge starts (@miceli)

- [ ] **Vapi decommission — final ops-lead confirmation.** Approved in design; needs explicit "yes" from AWKN ops lead before code/edge-function deletion.
- [ ] **Vehicles table fate** — Drop `vehicles` (Tesla-flavored) or keep for AWKN use (golf carts, employee fleet, guest assignment)?
- [ ] **PAI's new identity** — If voice agents are decommissioned wholesale, this question goes away. If kept (ops lead disagrees with decommission), what should PAI be? (Retreat-guest concierge / staff CRM helper / something else)
- [ ] **New default landing page** — Replaces `/residents/cameras.html` in `login/app.js:90`. Options: `/spaces/admin/`, role-aware, `/portal/`, master-schedule.
- [ ] **profile.html destination** — Stripe (`create-payment-link/index.ts:128`) and SignWell (`signwell-webhook/index.ts:597,628,900`) email URLs depend on this.
- [ ] **Alpaca Mac LaunchAgents** — `Sonos HTTP API`, `WiZ Proxy`, `Music Assistant`, `Printer Proxy`, `spirit-whisper-worker`, `sonos-schedule-runner` — confirm Mac can be turned off.

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Phase 1 — Alpaca purge + repo hygiene (next active phase)

Six passes, per spec §7. Pre-Phase-1 brainstorm produces the implementation plan.

- [ ] **Pass 1** — Bulk delete `/residents/`, IoT files, build artifacts, `*2.md` dupes, branding rename
- [ ] **Pass 2** — Cross-reference grep sweep (deletion manifest)
- [ ] **Pass 3** — Page-by-page admin BOS audit (interactive, ~25-30 pages, chunked by pillar)
- [ ] **Pass 4** — Vapi decommission (pending CTO confirm above)
- [ ] **Pass 5** — Supabase + droplet cleanup (audit → snapshot → test-DB rehearsal → soft-delete on prod)
- [ ] **Pass 6** — Restore + update project docs

### Phase 2-7 (deferred to their own brainstorms)

See spec §8-13 for scope. Not actionable until Phase 1 lands.

### Cross-cutting

- [ ] No tests / no TypeScript / no CI gates on money handlers (Stripe, Square, PayPal). Addressed incrementally as each phase touches the relevant code.
- [ ] Audit auto-merge agentic systems (Bug Scout, Feature Builder) — they push to `main` without visible governance. Critical to pause/repoint before Phase 6.
- [ ] Migrate Resend, Cloudflare R2, DigitalOcean droplet from founder's personal Google account (`wingsiebird@gmail.com`) to a business workspace.
- [ ] Lock in Pillar model (Ranch / Within / Retreat / Venue) **before Phase 6**. Consolidate overlapping pages: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`.
- [ ] Kill stale branches: `claude/romantic-maxwell`, `fix/remove-external-service-ci`, `founder-ideas`, `hero-update`.

## Enhancements (nice to have)

### Side decisions deferred to relevant phase brainstorms

- [ ] **Pricing inconsistency on awknranch.com** — `/membership` $199, `/offerings2` $119/$149/$349, `/membership-1` $144/$199/$444. Resolve in Phase 3.
- [ ] **Event platform consolidation** — Eventbrite / Partiful / Luma / direct Stripe / Recess all live. Pick one or two. Phase 3.
- [ ] **EMR strategy** — stay on Tellescope (cheap, HIPAA-compliant) or invest in in-house? Affects Phase 5 portal scope.
- [ ] **CRM consolidation** — does within.center's LeadConnector / GoHighLevel CRM eventually fold into the AWKN admin BOS? Phase 4.
- [ ] **Subdomain shape** — unified `app.*` vs separate apps per brand. Phase 5.
- [ ] **within.center blog authorship post-migration** — MDX (engineers) vs headless CMS (clinicians). Phase 4.

## Resumption Pointers (for next session)

When picking this back up, fastest paths to value:

1. **Run `/resume`** to load this state.
2. **Read the program spec** (`docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`) — full context.
3. **Brainstorm Phase 1** via `superpowers:brainstorming`. Goal: produce a Phase 1 spec at `docs/superpowers/specs/2026-MM-DD-phase-1-alpaca-purge-design.md`.
4. **Get CTO answers** on the Critical items above before plan-writing for Pass 3+.
5. **Pass 1 (bulk delete) doesn't depend on CTO answers** — runnable as soon as the Phase 1 plan is approved.

The save directory at `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` holds pre-reset copies of the 4 docs + spec + plan as insurance. Delete it whenever (recommend: end of Phase 2).
