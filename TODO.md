# AWKN — TODO

> **Active program:** 8-phase cleanup + Next.js refactor.
> Program spec: `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`
> Phase 1 spec: `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`

## Phase 6a status (as of 2026-05-06 EOD)

Local implementation **complete** on `miceli`. 9 commits, `71b176da` → `f93c1ac3`. Plan locked at `docs/superpowers/specs/2026-05-07-phase-6a-team-subdomain-migration.md` (Codex-audited, 30 issues addressed).

**Awaiting user decision: merge `miceli` → `main`** (per `feedback_no-merge-to-main` rule, never auto-merge). Merge ships 6a.1 (M2) + 6a.4 (Associates delete) to GitHub Pages prod immediately; the rest is awkn-web-app changes that don't ship anywhere yet (no Vercel project linked).

## Phase 6a-Deploy (production cutover — deferred)

Tomorrow per stakeholder timing. The user is moving awkn-web-app to a clean GitHub repo + new Vercel project. Cutover steps:

- [ ] Create new GitHub repo for awkn-web-app
- [ ] Create new Vercel project linked to that repo
- [ ] Set Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`. Do NOT set `NEXT_PUBLIC_DISABLE_AUTH=true` in prod.
- [ ] Add `team.awknranch.com` (and eventually `awknranch.com`, `www.awknranch.com`, `within.center`) as Vercel project domains
- [ ] Add CNAME at DNS provider (TBD — `dig +short NS awknranch.com` to identify) → `cname.vercel-dns.com`. DNS-only / proxy OFF if Cloudflare.
- [ ] Verify TLS provisioned: `curl -v https://team.awknranch.com/`
- [ ] Promote main → Vercel prod
- [ ] Operator runbook (planned per spec §Production Cutover) — communicate to team before flipping DNS

## Critical (blocks production)

### Open questions across phases

**Resolved:** Vapi GO, vehicles DROP, PAI moot, Mac LaunchAgents irrelevant, post-login redirect, mobile/ delete, upstream-template-sync (negative), monorepo vs single-app (single-app wins).

**Still open for COO:**
- [x] ~~**SignWell webhook status**~~ — Resolved 2026-05-06 by dump-secrets audit + code trace. SignWell is **half-wired**: outbound signing flows (`create-proposal-contract` for AWKN rental agreements + `create-retreat-agreement` for Within retreat agreements) are ACTIVE in prod — operator clicks Send Proposal, SignWell emails the client a branded document, client signs. Inbound `signwell-webhook` and the browser-side `signwell-service.js` / `templates.js` UI are DEAD because they try to read missing `signwell_config` table. Status updates on signed/declined likely happen manually. Decision needed: fix the webhook (read API key from env instead of DB, like the outbound functions do) or accept manual status updates.
- [ ] **`/directory/` historical intent** — AWKN scaffolding for client profiles, or partially-rebranded residue? Preserve regardless; answer informs Phase 5 build.

**Resolved 2026-05-06:**
- [x] ~~SignWell webhook fix~~ — Done. `signwell-webhook/index.ts` now reads `Deno.env.get("SIGNWELL_API_KEY")` like its outbound siblings; signed/declined callbacks will flow on next prod deploy.
- [x] ~~R2 revive-or-retire~~ — Retired. Hosting on Vercel; Vercel Blob handles future object-storage needs. Deleted `_shared/r2-upload.ts` + `guestbook-upload/`; dropped unused R2 import from `resend-inbound-webhook`. Deploy cleanup ↓.

**Pending COO/CTO:**
- [ ] **Within Center uses a SEPARATE Supabase project** — `within-center/book/index.html` calls `gatsnhekviqooafddzey.supabase.co` for `create-within-checkout-session`, distinct from AWKN's `lnqxarwqckpmirpmixcw`. The Within booking deposit flow runs against its own DB entirely. Long-term desire is a singular DB for everything; need stakeholder call on whether to consolidate Within into AWKN's Supabase, keep them separate, or migrate AWKN into Within's. Affects Phase 6+ Within-portion port planning.

**Still open for CTO:**
- [ ] **`/directory/` historical intent** — AWKN scaffolding for client profiles, or partially-rebranded residue? Preserve regardless; answer informs Phase 5 build.
- [ ] **Wire AWKN public-site forms into the BOS as subscribable lead sources** — Currently the 3 public forms on awknranch.com (book, host-a-retreat, contact) are pure `mailto:hello@awknranch.com` scaffolding. Lauren created them on 2026-05-06 (commits `2c20f2c2` + `f07f3983`) as scaffolds and never wired backend. They send NO data to Supabase, NO data to CRM, no `crm_leads` row, no audit trail. Mobile users without configured email apps get silent failures. Should each become a `crm_leads` insert + Resend confirmation email + appear in BOS CRM as a new lead the operator can act on. Make each form a SUBSCRIBABLE source so operators can filter "show me all leads from /book" vs "from /host-a-retreat" etc. Form fields by page:
  - `/book` — name, email, dates, party size, interest, description, notes
  - `/host-a-retreat` — name, email, org, size, dates, modality, vision, description
  - `/contact` — name, email, reason (general/rental/event/sauna/worktrade/visit/other), msg, description
  - Plus the "Add me to the AWKN list" mailto on home → newsletter signup integration (separate decision: Mailchimp / Klaviyo / Resend Audience / Loops)

**Process directives:** strategic well-scoped commits direct to `miceli`, zero prod DB writes during refactor (read-only prod via `supabase db query --linked` + `drizzle-kit pull` only), no parallel local DB. **Never merge to main without explicit user permission** (memory: `feedback_no-merge-to-main`).

## Phase 6b — long-game React rebuild (post-cutover)

After 6a-Deploy lands, kick off the page-by-page React rebuild on a separate dev branch. No time pressure. Order:

- Tier 1 (warmup): manage, appdev, testdev, devcontrol, job-titles
- Tier 2 (read-mostly): dashboard, staff, users, passwords
- Tier 3 (real CRUD): clients, scheduling, reservations, events
- Tier 4 (money/risk): crm, accounting, purchases, proposals — already protected by M3 server-side gates

Other 6b deferred work:
- [ ] Persistent audit log table for M3 mutations (currently console.log via Vercel logs)
- [ ] HttpOnly-cookie session migration (currently bearer-token via legacy localStorage)
- [ ] Browser-side `signwell-service.js` + `templates.js` UI cleanup (read missing `signwell_config` table — fully deletable)
- [ ] Delete 37 Phase-2 RouteStubs in `awkn-web-app/src/app/team/<name>/page.tsx` as React rebuilds replace them
- [ ] `savePermissions()` in users.js still client-side (M3 only covers wholesale resetPermissions, not per-permission editing)
- [ ] Public/login/app.js TS errors (pre-existing checkJs noise) — clean up legacy JS or relax checkJs scope
- [ ] SignWell webhook E2E test (bundled into UI testing pass — defer until live clients ramp up)

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Phase 1 — Alpaca purge ✅ complete

6 passes, ~50k+ LOC removed across the program. Deletion manifest at `docs/superpowers/work/2026-05-03-alpaca-inventory.md`. Pass 6 close-out commit `bc172802`.

### Phase 2 — Next.js scaffold + DB + auth ✅ complete

Single multi-domain Next.js app at `awkn-web-app/`. Phase 2.1–2.4 done. Commits `094c356d` → `01fcd5da`. Coexists with legacy code at repo root which keeps deploying to GitHub Pages.

### End-of-program cutover (Task 2.11 — bundled deferral)

Single prod-write event after Phase 6. Runbook: `docs/migrations/2026-05-04-prod-cleanup-runbook.md`.

- [ ] Undeploy 6 prod edge functions: `vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`, `guestbook-upload` (R2 retired 2026-05-06)
- [ ] Stop droplet IoT pollers (`tesla-poller`, `lg-poller`) — needs SSH config first
- [ ] Drop dormant Supabase Functions env vars on those undeployed functions, plus the 5 R2_* secrets if any get set later

### Phase 3 — Audit-driven port of legacy → `awkn-web-app/` (in flight)

**Reframed mid-session 2026-05-05** — original spec §9 framed Phase 3 as "awknranch.com → Next.js rebuild" (Squarespace migration). Actual current goal: **port the existing repo's pages and surfaces** (legacy public pages, BOS, edge functions) into `awkn-web-app/`. Public-site rebuilds are downstream. See `project_refactor-program-scope` memory.

**Established this session:**
- Verbatim Route Handler port pattern (`serveLegacyHtml()` helper)
- `(internal)` route group bypassing public chrome
- Dev landing as live port-progress index (`port-status.ts` manifest)
- Functional `/login` legacy bridge — sessions in `localStorage[awkn-ranch-auth]` flow into other ported pages that read the same key

**Ported (12):** `/operations`, `/investor`, `/investor-presentation`, `/investor/projections`, `/investor/projections-10y`, `/pricing`, `/pricing/wordpress-embed`, `/team`, `/schedule`, `/schedule/manage`, `/retreat`, `/login`. Plus `/logged-in` (custom).

**Continuing through ecosystem audit** — root pages remaining (events/, community/, photos/, contact/, etc.), Within Center marketing site (15 pages in `within-center/`), BOS admin (38 pages in `spaces/admin/`), associates pages, and ~63 Supabase edge functions. Per-port methodology in `project_port-methodology` memory.

**Cross-cutting follow-ups picked up this session:**
- [ ] **Cleanup of legacy `app.js` patches in public/login/app.js.** The patched copy bypasses role-based redirects; eventually want real per-role landing pages in the new app (BOS dashboard for team, portal home for members) and restore role-based routing.
- [ ] **`cloudflare/` orphan.** Worker existed primarily to feed deleted `clauded/` session dashboard. Decide delete vs keep.
- [ ] **Consolidate per-domain logins.** Phase 2.4 stubs at `portal/login` + `bos/login` use `@supabase/ssr` cookies; ported `/login` uses legacy localStorage. Bridge or pick-one post-deploy.

### Phase 4-7 (deferred to their own brainstorms)

See program spec §10-13. Phase 4 (within.center) and Phase 6 (BOS hardening) likely re-shape similarly to Phase 3's reframe.

### Cross-cutting

- [ ] No tests / no TypeScript on legacy BOS / no CI gates on money handlers (Stripe, Square, PayPal). Addressed incrementally per phase.
- [ ] **Hardcoded SUPABASE_ANON_KEY JWTs** at 6 sites: legacy `spaces/admin/crm.js` (lines 1349, 1619, 1652, 1679, 2078, 3510) + `spaces/admin/clients.js:2259`. Should import from `shared/supabase.js`.
- [ ] **R2 bucket name `your-app`** — template residue hardcoded in legacy `shared/config-loader.js`, `supabase/functions/_shared/api-helpers.ts`, `supabase/functions/_shared/property-config.ts`. Rename Cloudflare bucket + update code together.
- [ ] **Audit auto-merge agentic systems** (Bug Scout, Feature Builder) — push to `main` without visible governance. **Critical to pause/repoint before Phase 6.**
- [ ] Migrate Resend, Cloudflare R2, DigitalOcean droplet from founder's personal Google account (`wingsiebird@gmail.com`) to a business workspace.
- [ ] Lock in Pillar model (Ranch / Within / Retreat / Venue) **before Phase 6**. Consolidate overlapping pages: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`. Pillar tags input: `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.
- [ ] Bitwarden Vapi entry cleanup (manual). AWKN is also leaving Bitwarden post-migration — secrets management for new app uses `.env.local` + Vercel env vars; final answer post-refactor.
- [ ] Kill stale branches: `claude/romantic-maxwell`, `fix/remove-external-service-ci`, `founder-ideas`, `hero-update`.

## Enhancements (nice to have)

### Side decisions deferred to relevant phase brainstorms

- [ ] **EMR strategy** — stay on Tellescope (cheap, HIPAA-compliant) or invest in in-house? Affects Phase 5 portal scope.
- [ ] **CRM consolidation** — does within.center's LeadConnector / GoHighLevel CRM eventually fold into the AWKN admin BOS? Phase 4.
- [ ] **Subdomain shape** — unified `app.*` vs separate apps per brand. Phase 5.
- [ ] **within.center blog authorship post-migration** — MDX (engineers) vs headless CMS (clinicians). Phase 4.

## Next session

1. **Run `/resume`** to load this state.
2. **Continue audit-driven port.** User is directing batch-by-batch through the ecosystem audit list. Last completed: Investor / Operations + Reference (login + pricing/team/schedule/retreat). Next likely: remaining root public pages (events/, community/, photos/, contact/, waiver/, orientation/, worktrade/, planlist/, directory/, groundskeeper/, image-studio/) per the original audit list, then within-center/, then spaces/admin/.
3. **Operating mode:** loose cadence — see `feedback_audit-port-cadence` memory. User says delete/port → just do it; don't audit every inbound link before each delete; commit at natural breakpoints.
4. **Branch state:** `miceli` is N commits ahead of `origin/miceli` (this session not yet pushed) and many commits ahead of `origin/main`. Stay on `miceli`. End-of-program one big merge to `main`.
5. **Dev:** `cd awkn-web-app && npm run dev`. Visit `localhost:3000` for port-progress index. Toggle `NEXT_PUBLIC_DISABLE_AUTH` in `.env.local` to bypass auth gates on bos/portal during dev.
6. **Auth testing surface:** `awknranch.localhost:3000/login` is the legacy-styled functional sign-in. After Google or email/password, lands at `/logged-in`. Then `/team` shows live edit-capable session bridged in via `localStorage[awkn-ranch-auth]`.
