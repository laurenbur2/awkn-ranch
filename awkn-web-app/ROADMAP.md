# awkn-web-app — Roadmap

Two parallel tracks. Track A is for live business value; Track B is the under-the-hood improvement work.

| | Track A: Features | Track B: Refactoring |
|---|---|---|
| **Purpose** | Build new business-facing capability | Modernize internals to align with the Next.js stack |
| **Priority** | High — actually ships value to users + operators | Continuous improvement — opportunistic |
| **Pace** | Sprint-based, time-boxed | Background work between feature sprints |
| **Driver** | Stakeholder need / operator request | Engineering taste + maintainability |

---

## Track A — Features (priority order)

These ship customer-facing or operator-facing capability. Order reflects business impact + dependencies.

### Phase A1 — Lead capture unification (highest priority)

**Goal:** Every public form (4 total — 3 AWKN + 1 Within) writes to a unified `crm_leads` table and shows up in BOS CRM as a subscribable lead source.

- [ ] **Schema design** — extend `crm_leads` with `business_line` ("awkn" | "within"), `source` ("public_book" | "public_host_retreat" | "public_contact" | "within_contact" | "newsletter"), and a per-source `payload_json` field for the form-specific fields
- [ ] **`/api/leads` endpoint** — single Server Action accepting typed payload + role-based validation. Origin allowlist matches each form's domain. Rate-limit per IP. Spam filter via Cloudflare Turnstile or hCaptcha integration.
- [ ] **Resend confirmation emails** — branded per business_line. Within = within-branded, AWKN = awkn-branded. Body templated from a `email_templates` table (after move-to-BOS, see Track B).
- [ ] **Form-side wiring** — replace `mailto:` actions on AWKN's 3 forms + replace `formsubmit.co` integration on within contact form. All 4 → `fetch('/api/leads', { method: 'POST', body })` with field-level validation.
- [ ] **BOS CRM "Inbound" tab** — operator view filtered by `source`. Mark contacted, escalate to lead, dismiss.
- [ ] **Newsletter integration** — separate stakeholder decision (Mailchimp / Klaviyo / Resend Audience / Loops). Wire the home-page "Add me to AWKN list" + within similar.

### Phase A2 — SignWell automation completion

- [ ] **Webhook E2E test** (already half-done) — verify signed/declined callbacks auto-update proposal + retreat agreement status in DB. Currently inferred to work post-fix; needs live confirmation.
- [ ] **Persistent audit log** for SignWell events (not just M3 mutations) — see who signed what when, queryable in BOS
- [ ] **Email follow-up sequences** — once signed, trigger Resend cadence (welcome + prep + reminder) keyed to ceremony date

### Phase A3 — Within consolidation

Depends on stakeholder decision (see TODO § Stakeholder discussion items).

- [ ] **If consolidation chosen:** Within data migration into AWKN's Supabase. New unified `create-checkout-session` edge function with `business_line` param. Stripe Connect or single account decision.
- [ ] **Within booking flow port** — once data plane unified, port `within.center/book/` from verbatim HTML to React Server Component reading from unified DB
- [ ] **Within-on-team CRM view** — operators see Within bookings + leads alongside AWKN in one BOS

### Phase A4 — Client portal (Phase 5 in older docs)

Greenfield work. Currently scaffolded under `src/app/portal/` with placeholder pages.

- [ ] Schema gap fix: `app_users` missing `slug`/`bio`/`pronouns` for portal profile pages
- [ ] Authenticated client view: their bookings, payments, documents, scheduling
- [ ] Unified portal across AWKN + Within (single `portal.awknranch.com` per stakeholder decision earlier in the program)

### Phase A5 — Pillar model lock-in

Per CLAUDE.md, the IA is mid-refactor around four pillars: **Ranch / Within / Retreat / Venue**. Several BOS pages overlap (`events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`).

- [ ] Pillar-tag input per page (existing draft: `legacy/docs/superpowers/work/2026-05-03-page-pillar-tags.md`)
- [ ] Consolidate overlapping pages into pillar-aware single sources
- [ ] Lock the model before any major BOS React rebuild (Track B)

### Phase A6 — Analytics + observability

- [ ] CSP allowlist + integration: Vercel Analytics (free, native) or Plausible (privacy-friendly, GDPR)
- [ ] PostHog for product analytics — already a usable plugin per session config; instrument key flows (form submit, signup, booking, payment)
- [ ] Sentry for error tracking + performance — Sentry plugin available

---

## Track B — Refactoring / Continuous improvement (priority order)

Modernize internals to align with the Next.js + Vercel stack. Ships no new business value, but improves maintainability, performance, and developer experience.

### Phase B1 — Audit + observability infrastructure

- [ ] **Persistent audit log table** — currently M3 mutations log via `console.log` captured by Vercel function logs. Move to a queryable `audit_log` table with operator filterable views in BOS.
- [ ] **HttpOnly cookie session migration** — currently bearer-token via legacy localStorage. Move to `@supabase/ssr` cookies with `Domain=.awknranch.com` so sessions cross subdomains naturally.

### Phase B2 — BOS React rebuild (the long game)

39 BOS admin pages currently served as verbatim legacy HTML via `serveLegacyHtml()`. Convert to native React Server Components page-by-page on a separate dev branch. No time pressure — only convert when there's a forcing function (audit log requirement, dynamic content need, performance issue, etc.).

Order (safest first, riskiest last — M3 server-side gates protect Tier 4 even if React-side has bugs):

- **Tier 1 (warmup):** `manage`, `appdev`, `testdev`, `devcontrol`, `job-titles` — simple, internal-only, low risk
- **Tier 2 (read-mostly):** `dashboard`, `staff`, `users`, `passwords` — display + light CRUD
- **Tier 3 (real CRUD):** `clients`, `scheduling`, `reservations`, `events` — operator workflows, no money flow
- **Tier 4 (money/risk):** `crm`, `accounting`, `purchases`, `proposals` — highest risk, already protected by M3 server-side gates

### Phase B3 — Public-page Reactification (deferred indefinitely)

8 AWKN public pages + 38 Within pages currently serve as verbatim legacy HTML. Reactification cost is high (~30-50 hours for Within alone), and there's no forcing function unless we want:
- Dynamic content (live pricing, calendar)
- A/B tests via Vercel
- Native `next/image` optimization
- Component reuse across pages

Lauren's HTML-edit workflow is preserved by NOT Reactifying. This phase only activates when a forcing function emerges.

### Phase B4 — Browser-side legacy cleanup

- [ ] **Delete `signwell-service.js` + `templates.js` UI** — read missing `signwell_config` table; deletable now that the webhook fix uses env-key auth
- [ ] **Delete 37 Phase-2 RouteStubs** in `src/app/team/<name>/page.tsx` as React rebuilds replace them
- [ ] **`savePermissions()` per-permission editing** — M3 only covers wholesale `resetPermissions`. Per-permission writes still client-side. Wrap in a server gate when convenient.
- [ ] **`public/login/app.js` TypeScript errors** — pre-existing `checkJs: true` noise. Either clean up legacy JS or relax `checkJs` scope.

### Phase B5 — Build + deploy infrastructure

- [ ] **Mirror-sync automation** — `scripts/sync-bos-mirror.sh` and `scripts/sync-legacy.sh` are manual. GitHub Action on push to specific paths in the legacy repo could auto-sync.
- [ ] **Vercel Build Cache tuning** — review `next.config.js` for any optimization opportunities post-cutover
- [ ] **Turbopack-specific tuning** — once on Vercel, profile dev server startup + HMR for Turbopack-specific wins

### Phase B6 — Vercel platform features

Once on Vercel, opt into platform capabilities incrementally:

- [ ] **Vercel Blob** — replaces Cloudflare R2 (already retired). Use for guestbook media + email attachments + admin uploads.
- [ ] **Vercel Edge Config** — feature flags, kill switches, runtime config without redeploys
- [ ] **Vercel Cron Jobs** — replace any pg_cron-driven Supabase Functions where Vercel Cron is a better fit
- [ ] **Vercel AI Gateway** — if/when LLM features land (chat widget, content generation, etc.), use AI Gateway for routing + cost tracking
- [ ] **Vercel Workflow** — durable workflows for any multi-step ops (signWell → invoice → confirmation cascade, etc.)

### Phase B7 — Testing + CI

- [ ] **Playwright E2E** — currently only have ad-hoc curl smoke tests. Convert to a Playwright suite covering each major user flow per domain.
- [ ] **Vitest unit tests** — for the M3 endpoints + any future Server Actions. Currently zero unit test coverage.
- [ ] **CI gates on money flows** — before any Tier 4 BOS rebuild, gate the rebuild PR on tests covering Stripe/payment paths

---

## How to read this roadmap

- **Track A items** should pull stakeholder review + business prioritization. Each phase delivers user-visible value.
- **Track B items** are pull-when-convenient. Pick one during a slow week or after a feature ship. Don't block features for refactoring.
- Both tracks update STATUS.md when work lands. TODO.md captures near-term items not yet on the roadmap.

When in doubt: ship features (Track A). Refactoring is a forever project; features have customers waiting.
