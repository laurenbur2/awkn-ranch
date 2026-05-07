# AWKN — Status

**Last Updated:** 2026-05-06 (session: main merge + Phase 3→6 transition)
**Last Updated By:** Matthew Miceli (`miceli`)

## Project Overview

Bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`, Squarespace today)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`, WordPress today)

Single integrated business. Legacy admin BOS at `/spaces/admin/` is the source of truth and continues deploying to GitHub Pages from `main`. New Next.js app lives in `awkn-web-app/` (subfolder, coexists with legacy).

Architecture and migration plan: `docs/ECOSYSTEM-MAP.md` + `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`.

## Active program

**8-phase cleanup + Next.js refactor** on `miceli`.

**Phase 0** ✅ · **Phase 1** ✅ Alpaca purge · **Phase 2** ✅ scaffold + auth · **Phase 3** ✅ audit-driven port · **Phase 6** 🟡 starting (consolidation + IA cleanup)

### Phase 3 — port catalog (complete, ongoing additions)

**107 entries** in `awkn-web-app/src/lib/port-status.ts` across 4 domains. Snapshot:

| Domain | Group | Count |
|---|---|---|
| `awknranch` | Public site (home + property/book/host-a-retreat/services/events/contact/team) | 8 |
| `awknranch` | Investor / Operations | 5 |
| `awknranch` | Reference (pricing, schedule, retreat) | 6 |
| `awknranch` | Auth (login + reset/update/email-confirm) | 5 |
| `awknranch` | Team Portal (sign-in landing + org chart) | 2 |
| `awknranch` | BOS Admin | 39 |
| `awknranch` | Associates | 4 |
| `within` | Marketing + Booking + Ceremonial Ketamine + Immersive Retreat + Resources + Conditions + Email Templates + Clinical (future) | 38 |

**Established patterns:** verbatim Route Handler ports via `serveLegacyHtml()` helper at `awkn-web-app/src/lib/serve-legacy-html.ts`; `(internal)` route group bypasses `DomainNav`; dev landing at `/` is the live port-progress index.

### Phase 6 — kicked off this session

- **`bos.` → `team.` rename.** Domain key, prod hostnames, dev matchers, route folders (`src/app/bos/` → `src/app/team/`) all flipped. BOS Admin pages keep serving on `awknranch.localhost` through Phase 5 — only the Phase-2 hostname stub renamed.
- **Public spaces retired.** 5 public-facing Spaces application pages (`/spaces`, `/spaces/apply`, `/spaces/hostevent`, `/spaces/verify`, `/spaces/w9`) deleted across legacy + ports + manifest. Venue rentals now go through CRM, not a public form. `spaces/admin/` (the BOS) untouched.
- **Env inventory written.** Comprehensive `awkn-web-app/.env.example` mapping every prod Supabase Functions secret to vault locations + flagging DB-row-managed credentials (Telnyx, WhatsApp, Square, Tellescope) so we don't double-store them.
- **Lauren + Justin work factored from `origin/main`.** 12 net-new commits merged: Lauren's public AWKN Ranch site (`/`, 6 sub-pages, 26 image assets) + portal restructure (team portal moved to `/portal/`, internal team org chart to `/portal/team-chart/`, public team page now at `/team/`). Justin's invoice flow with Stripe pay buttons + branded `invoice_sent` email + 2 new SQL migrations (already applied to prod).

### Branching + DB rules

- **Branching:** `miceli` is the long-lived workspace. Strategic well-scoped commits direct to `miceli`. Currently 35 commits ahead of `origin/miceli`; force-push pending.
- **DB:** read-only prod via Supabase MCP and `drizzle-kit pull`. No parallel local clone. Single prod-write event reserved for end-of-program cutover.

## Feature Status

| Area | State | Notes |
|---|---|---|
| Legacy BOS at `spaces/admin/` | ✅ Live on GitHub Pages | Source of truth until cutover |
| New Next.js app `awkn-web-app/` | 🟡 Phase 6 starting | 107 ports wired; functional `/login` legacy bridge; dev landing tracks port progress |
| Voice / PAI / Vapi | ✅ Decommissioned | Source removed Pass 4. 5 prod edge fns still need undeploy at end-of-program cutover |
| Payments (Stripe + Square + PayPal) | ✅ Live (legacy) | Stripe invoice flow added by Justin 2026-05-06; no CI gates on money flows |
| SignWell e-sign | 🟡 Half-wired | Outbound `create-proposal-contract` + `create-retreat-agreement` ACTIVE (env-key based, real client emails ship); inbound webhook + browser `signwell-service.js` DEAD (read missing `signwell_config` table). Status updates likely manual. |
| Cloudflare R2 storage | ❌ Unwired | All 5 R2_* env vars unset in prod (confirmed via dump). `r2-upload.ts` callers (`guestbook-upload`, `resend-inbound-webhook`) silently throw. Same revive-vs-retire call as SignWell webhook. |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress; downstream of current port |
| Client portal | ⏳ Phase 5 | Greenfield |

## Known Limitations

- No tests / no TypeScript on legacy BOS / no CI gates on money handlers.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) needs to be locked before final BOS port.
- AWKN profile system (`/directory/`) has a schema gap — `app_users` is missing `slug`/`bio`/`pronouns`. Phase 5 closes the gap.
- **Multi-domain auth bridging:** new app's cookie-based `@supabase/ssr` and legacy localStorage-based auth are independent. The legacy bridge handles ports that use `shared/supabase.js`; cross-domain SSO is its own follow-up.
- **Dev permission bypass ≠ data access.** `NEXT_PUBLIC_DISABLE_AUTH=true` renders chrome but doesn't grant Supabase RLS access. Granting admin role on `app_users` for the dev's email is the data-access gate.

## Recent Changes (last 5 sessions)

| Date | Change | Author |
|---|---|---|
| 2026-05-06 | **Main merge + Phase 6 kickoff.** 12 net-new commits factored in from `origin/main` (Lauren's public site rebuild — 8 new pages + portal restructure; Justin's invoice flow with Stripe + 2 SQL migrations). Then: comprehensive `.env.example` salvaged from prod secrets, public spaces application surface retired (5 pages), and `bos` → `team` domain rename across the new app. STATUS.md refreshed to reflect actual port catalog (107 entries, was misreporting 12). 7 commits this session: `9741a7e4` (merge) → `12195dc4`. | Miceli |
| 2026-05-06 | **Hard reset + main merge + support fixes.** Local reset to `f4c37072` (right before the bos hostname move), then merged `origin/main` — Justin's BOS Edit-button + 6 admissions docs + Lauren's 6 condition card photo commits. Cherry-picked `f09540c0` (CompareButton hydration fix). Applied 5 support fixes for legacy URL/asset/auth runtime issues. **Decision:** BOS admin pages stay on awknranch hostname through Phase 5; bos hostname migration deferred to Phase 6. | Miceli |
| 2026-05-05 | **Phase 3 audit-driven port:** 12 legacy pages ported into awkn-web-app via verbatim Route Handlers under `(internal)` route group. Functional `/login` with legacy session bridge to `/team`. Dev landing now tracks port progress nested per-domain. | Miceli |
| 2026-05-04 | **Phase 2.4:** Supabase Auth wired against existing `app_users`. Login form (shadcn), `getCurrentUser()` server helper, sign-out endpoint. | Miceli |
| 2026-05-04 | **Phase 2.3:** `drizzle-kit pull` introspected prod (72 tables / 873 cols / 80 FKs / 180 policies). Live AWKN spaces render on `/team/spaces`. | Miceli |
