# awkn-web-app — TODO

> Open work for this app, organized by priority. For the broader feature
> roadmap (refactoring track + feature track), see [ROADMAP.md](./ROADMAP.md).

## Critical (blocks production)

_None currently — Phase 6a local implementation complete and stable._

## Phase 6a-Deploy — production cutover prerequisites

To go live on Vercel, complete in order:

- [ ] **Vercel project** — create or link a Vercel project pointing at this repo's `main` branch
- [ ] **Vercel domains** — add `team.awknranch.com`, `awknranch.com`, `www.awknranch.com`, and `within.center` to the project
- [ ] **DNS** — at the domain registrar (provider TBD; `dig +short NS awknranch.com` to confirm), add CNAMEs pointing to `cname.vercel-dns.com`. If using Cloudflare, set proxy mode to DNS-only (orange cloud OFF) so Vercel handles SSL.
- [ ] **TLS verification** — wait for Vercel cert issuance, then confirm with `curl -v https://team.awknranch.com/`
- [ ] **Vercel env vars** — set in project settings (Production + Preview):
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_PASSWORD`
  - **DO NOT set `NEXT_PUBLIC_DISABLE_AUTH=true`** in production
- [ ] **Pre-deploy smoke test** — verify representative routes on Vercel preview before promoting to prod
- [ ] **Operator runbook** — communicate to team: hard-refresh after cutover, re-login on new hostname (per-origin localStorage doesn't carry across subdomains)
- [ ] **Rollback script** — `scripts/rollback-6a-stack.sh` available if anything breaks (sequenced revert of the deploy stack)

## Bugs (broken functionality)

_None currently flagged in this app._

## Stakeholder discussion items (high priority — non-blocking)

These need human-decision input before implementation:

- [ ] **Within Center booking → SEPARATE Supabase project** — `within.center/book/` POSTs to `https://gatsnhekviqooafddzey.supabase.co/functions/v1/create-within-checkout-session`, distinct from AWKN's `lnqxarwqckpmirpmixcw`. Within booking + Stripe payments live in a DB the BOS can't see. Customer email may exist in BOTH databases as separate records.

  **Options:**
  - **A — full migration:** Move Within data + edge functions into AWKN's Supabase. One DB, one CRM, one Stripe account. Significant migration work.
  - **B — keep separate:** Two systems, accept bifurcation. Less work but harder to unify reporting later.
  - **C — partial mirror:** One-way sync of Within data into AWKN's Supabase. Operators see Within bookings in BOS but can't act on them.

  Affects: Within port scope, BOS roadmap, Stripe consolidation, customer-data architecture.

- [ ] **Within Center contact form → 3rd-party formsubmit.co** — `within.center/contact/` (file `legacy/within-center/contact/index.html:497`) POSTs to `https://formsubmit.co/ajax/intake@within.center`. Form data NEVER lands in AWKN or Within Supabase. No CRM trail. 3rd-party dependency for critical lead-capture.

  Migration path: wire to the same `crm_leads` + Resend pattern as proposed for AWKN public forms (below). Both items collapse into "Should Within share AWKN's data plane?" — the same call as the booking-Supabase decision.

- [ ] **Wire AWKN public-site forms into the BOS as subscribable lead sources** — Currently the 3 public forms on `awknranch.com` (book, host-a-retreat, contact) are pure `mailto:hello@awknranch.com` scaffolding. Lauren created them as scaffolds (commits `2c20f2c2` + `f07f3983` on 2026-05-06) and never wired backend. Send NO data to Supabase, NO data to CRM, no `crm_leads` row, no audit trail. Mobile users without configured email apps get silent submit failures.

  Each form should become a `crm_leads` insert + Resend confirmation email + appear in BOS CRM as a new lead. Make each form a SUBSCRIBABLE source so operators can filter "leads from /book" vs "from /host-a-retreat".

  Form fields by page:
  - `/book` — name, email, dates, party size, interest, description, notes
  - `/host-a-retreat` — name, email, org, size, dates, modality, vision, description
  - `/contact` — name, email, reason (general/rental/event/sauna/worktrade/visit/other), msg, description

  Plus the home-page "Add me to the AWKN list" mailto → newsletter signup integration (separate decision: Mailchimp / Klaviyo / Resend Audience / Loops).

- [ ] **Move within email templates off public within.center → into auth-gated BOS** — SECURITY ITEM. Two email-body templates are reachable as PUBLIC pages on within.center, indexable by search engines (within's robots.txt is `Allow: /`):

  - `within.center/emails/deposit-received/` — branded HEAL/deposit confirmation email body
  - `within.center/emails/ketamine-prep/` — HEAL package welcome / pre-ceremony prep instructions

  Routes:
  - `awkn-web-app/src/app/within/(internal)/emails/deposit-received/route.ts`
  - `awkn-web-app/src/app/within/(internal)/emails/ketamine-prep/route.ts`
  - Source HTML: `legacy/within-center/emails/{deposit-received,ketamine-prep}.html`

  Move target: `team.awknranch.com/spaces/admin/email-templates/{deposit-received,ketamine-prep}/` (auth-gated). Pre-existing exposure carried over from legacy GH Pages — surfacing now so the move-to-BOS happens before within.center DNS cuts over to Vercel.

- [ ] **`/directory/` historical intent** — AWKN scaffolding for client profiles, or partially-rebranded residue? Preserve regardless; answer informs Phase 5 build.

## Tech debt

- [ ] **Persistent audit log table for M3 mutations** — currently structured `console.log` captured by Vercel function logs. For real production with live clients, persist to an `audit_log` table that operators can query.
- [ ] **HttpOnly-cookie session migration** — currently bearer-token via legacy localStorage. Cookie unification across subdomains (with `Domain=.awknranch.com`) lands later.
- [ ] **Browser-side `signwell-service.js` + `templates.js` UI cleanup** — read missing `signwell_config` table; fully deletable now that the webhook fix uses env-key auth.
- [ ] **Delete 37 Phase-2 RouteStubs in `src/app/team/<name>/page.tsx`** — placeholder pages from Phase 2.2 scaffolding; deletable as React rebuilds replace them.
- [ ] **`savePermissions()` in users.js still client-side** — M3 only covers wholesale `resetPermissions`, not per-permission editing. Per-permission writes remain direct supabase calls.
- [ ] **`public/login/app.js` TS errors** — pre-existing `checkJs: true` noise. Either clean up legacy JS or relax `checkJs` scope.
- [ ] **SignWell webhook E2E test** — bundled into UI testing pass. Defer until live clients ramp up.
- [ ] **Mirror-sync automation** — `scripts/sync-bos-mirror.sh` is manual today. Consider GitHub Action that runs on push to legacy paths.

## End-of-program cutover (deferred)

Single prod-write event after the new app is live + stable. Runbook reference: `legacy/docs/migrations/2026-05-04-prod-cleanup-runbook.md` (in legacy repo).

- [ ] Undeploy 6 prod edge functions (no longer in scope): `vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`, `guestbook-upload`
- [ ] Stop droplet IoT pollers (`tesla-poller`, `lg-poller`) — needs SSH config
- [ ] Drop dormant Supabase Functions env vars on undeployed functions, plus the 5 R2_* secrets if any get set later

## Process directives

- **Branching:** strategic well-scoped commits to feature branches, no per-phase sub-branches
- **Prod DB discipline:** zero prod DB writes during refactor (read-only via `supabase db query --linked` + `drizzle-kit pull`). Carve-outs for explicit M3 verification documented per phase.
- **Never merge to main without explicit user permission** — hard rule; main is the user's gate, no auto-merge regardless of approvals/verifications/time pressure.
