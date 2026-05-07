# AWKN — Status

**Last Updated:** 2026-05-06 (session: Phase 6a local implementation complete)
**Last Updated By:** Matthew Miceli (`miceli`)

## Project Overview

Bespoke Business Operating System (BOS) backing two consumer brands:
- **AWKN Ranch** — Austin wellness retreat property (`awknranch.com`, Squarespace today)
- **Within Center** — clinical brand for ketamine/inpatient retreats (`within.center`, WordPress today)

Single integrated business. Legacy admin BOS at `/spaces/admin/` is the source of truth and continues deploying to GitHub Pages from `main`. New Next.js app lives in `awkn-web-app/` (subfolder, coexists with legacy).

Architecture and migration plan: `docs/ECOSYSTEM-MAP.md` + `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`.

## Active program

**8-phase cleanup + Next.js refactor** on `miceli`.

**Phase 0** ✅ · **Phase 1** ✅ Alpaca purge · **Phase 2** ✅ scaffold + auth · **Phase 3** ✅ audit-driven port · **Phase 6a** ✅ team subdomain consolidation (local) · **6a-Deploy** ⏳ awaiting Vercel/DNS · **Phase 6b** 📋 long-game React rebuild

### Phase 6a — local implementation complete (2026-05-06)

Per spec at `docs/superpowers/specs/2026-05-07-phase-6a-team-subdomain-migration.md`. Production cutover deferred until awkn-web-app is moved to its own GitHub repo + clean Vercel project (tomorrow per stakeholder timing).

**Shipped on `miceli`** (9 commits, `71b176da` → `f93c1ac3`):

- 6a.4 — Associates surface retired (4 routes + legacy + public mirror)
- 6a.1 — M2: 12 hardcoded SUPABASE_ANON_KEY JWTs eliminated; centralized via shared/supabase.js. New scripts/sync-bos-mirror.sh helper.
- 6a.3 — Auth gate hardened with path-traversal rejection (rejects `..`, percent-encoded slashes) + GET/HEAD method gate
- 6a.5 — 5 Auth routes moved to team subdomain (login, login/reset-password, login/update-password, admin/email-approved, admin/email-confirm)
- 6a.6 — Team Portal + /logged-in moved to team. URL collapsed: bare team.awknranch.com is now the sign-in landing
- 6a.7 — All 39 BOS Admin routes moved to team. New team/robots.txt with Disallow:/
- 6a.2 — M3: 5 highest-risk operator writes (role change, user delete, perm reset, payment-link create, lead delete) gated server-side via /api/team/* with bearer auth + Origin check + Zod validation + role matrix + structured audit logs
- 6a.8 — next.config.js 301 redirects from awknranch.com legacy paths → team.awknranch.com (no-op locally; activates at prod cutover). /api/webhooks/* explicitly excluded so vendor URLs (Stripe/SignWell/Resend) don't need updating

### Phase 6a port catalog — 110 entries across 5 domains

| Domain | Group | Count |
|---|---|---|
| `awknranch` | Public site (home + property/book/host-a-retreat/services/events/contact/team) | 8 |
| `awknranch` | Investor / Operations | 5 |
| `awknranch` | Reference (pricing, schedule, retreat) | 6 |
| `team` | Auth (login + reset/update/email-confirm) | 5 |
| `team` | Team Portal (root sign-in + team-chart + logged-in) | 3 |
| `team` | BOS Admin | 39 |
| `within` | Marketing + Booking + Ceremonial Ketamine + Immersive Retreat + Resources + Conditions + Email Templates + Clinical (future) | 38 |
| `team` | API routes (M3 server-side gates, not in port-status.ts) | 5 |

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
| Legacy BOS at `spaces/admin/` | ✅ Live on GitHub Pages | Source of truth until Vercel cutover. M2 fix lands here on next main-deploy (centralized SUPABASE_ANON_KEY). |
| New Next.js app `awkn-web-app/` | ✅ Phase 6a complete (local) | 110 ports + 5 M3 API gates. Team subdomain consolidated. Production cutover (6a-Deploy) deferred until awkn-web-app moves to its own GitHub repo + clean Vercel project. |
| Team subdomain (team.awknranch.com) | 📋 Local-only | Auth + Team Portal + BOS Admin (47 routes) live on `team.localhost:3000` in dev. Auth-gated, path-traversal-resistant. Awaiting Vercel + DNS cutover. |
| M3 server-side gates | ✅ Live (local) | 5 highest-risk operator writes go through /api/team/* with bearer auth + Origin allowlist + Zod + role matrix + audit logs. |
| Voice / PAI / Vapi | ✅ Decommissioned | Source removed Pass 4. 5 prod edge fns still need undeploy at end-of-program cutover |
| Payments (Stripe + Square + PayPal) | ✅ Live (legacy) | Stripe invoice flow added by Justin 2026-05-06; no CI gates on money flows |
| SignWell e-sign | ✅ Live | Outbound + inbound webhook now both env-key based (webhook fix 2026-05-06). Signed/declined callbacks auto-update proposal + retreat agreement status. Browser-side `signwell-service.js` + `templates.js` UI still dead (deletable). |
| Cloudflare R2 storage | ✅ Retired | Vercel-hosted now; Vercel Blob will replace any future object-storage need. Helper + sole consumer (guestbook-upload) removed; resend-inbound-webhook's unused R2 import dropped. `guestbook-upload` still deployed in prod — undeploy bundled into end-of-program cutover. |
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
| 2026-05-06 | **Phase 6a local implementation complete.** 9 commits, `71b176da` → `f93c1ac3`. Associates retired, M2 (12 hardcoded JWTs centralized + sync script), auth gate hardened, 47 team-facing routes moved (5 auth + 3 portal + 39 BOS admin), team/robots.txt, M3 (5 server-side gated risky writes with bearer auth + Origin + Zod + role matrix + audit logs), next.config.js production redirects ready. Production cutover (6a-Deploy) deferred — awkn-web-app moves to clean GitHub + Vercel tomorrow. | Miceli |
| 2026-05-06 | **Plan + audit + integrations cleanup.** Phase 6a spec drafted, Codex-audited (30 issues, 29 incorporated), revised to v2. Earlier in session: SignWell webhook fixed (env-key based), R2 retired (Vercel Blob future replacement), within-center separate Supabase flagged for stakeholder. Memory updated. | Miceli |
| 2026-05-06 | **Main merge + Phase 6 kickoff.** 12 net-new commits factored in from `origin/main` (Lauren's public site rebuild — 8 new pages + portal restructure; Justin's invoice flow with Stripe + 2 SQL migrations). Then: comprehensive `.env.example` salvaged from prod secrets, public spaces application surface retired, `bos` → `team` domain rename. | Miceli |
| 2026-05-06 | **Hard reset + main merge + support fixes.** Local reset to `f4c37072` (right before the bos hostname move), then merged `origin/main` — Justin's BOS Edit-button + 6 admissions docs + Lauren's 6 condition card photo commits. Cherry-picked `f09540c0` (CompareButton hydration fix). Applied 5 support fixes for legacy URL/asset/auth runtime issues. **Decision:** BOS admin pages stay on awknranch hostname through Phase 5; bos hostname migration deferred to Phase 6. | Miceli |
| 2026-05-05 | **Phase 3 audit-driven port:** 12 legacy pages ported into awkn-web-app via verbatim Route Handlers under `(internal)` route group. Functional `/login` with legacy session bridge to `/team`. Dev landing now tracks port progress nested per-domain. | Miceli |
| 2026-05-04 | **Phase 2.4:** Supabase Auth wired against existing `app_users`. Login form (shadcn), `getCurrentUser()` server helper, sign-out endpoint. | Miceli |
| 2026-05-04 | **Phase 2.3:** `drizzle-kit pull` introspected prod (72 tables / 873 cols / 80 FKs / 180 policies). Live AWKN spaces render on `/team/spaces`. | Miceli |
