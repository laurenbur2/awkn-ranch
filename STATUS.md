# AWKN — Status

**Last Updated:** 2026-05-03 (post-Pass-4)
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

**Phase 0** ✅ complete. **Phase 1 Pass 1** ✅ complete. **Phase 1 Pass 2** ✅ functionally complete (property-ai reclassified to Pass 4; Task 2.11 deferred to cutover). **Phase 1 Pass 3** ✅ complete: 41 admin BOS pages audited. **Phase 1 Pass 4** ✅ complete (this session): wholesale Vapi/PAI/AlpaClaw decommission. ~9,500 LOC removed across 22 files in 4 batches: (A) 13 wholesale deletes — 5 edge functions including the 4019-line `property-ai/index.ts`, 6 admin pages, 2 shared modules; (B) shell/registry surgery (admin-shell, resident-shell, feature-registry); (C) page surgery (faq + accounting + contact); (D) webhook surgery (resend-inbound-webhook 3563 → 2580 lines, all 13 PAI/AlpaClaw functions removed, herd/payments/guestbook/claudero/forwarding flows preserved). Webhook PAI-routed actions (process_receipt/document/command, auto_reply) now fall through to forward_admin (human). Bitwarden cleanup + prod-side undeploy of vapi-* edge functions deferred to end-of-program cutover (Task 2.11) per prod-discipline rule.

**Branching model:** `miceli` is the long-lived workspace where the entire transformation lives. Work commits directly to `miceli` — no per-phase sub-branches (overrides program spec §4 Decision 8). Periodic `git pull origin main` ingests teammate work; do NOT push `miceli` → `main` during the program.

**DB strategy:** zero prod DB writes during Phase 1. Local Postgres clone via `supabase start` becomes the dev target through Phases 2-6. Prod gets touched once at end-of-program cutover against the crystallized schema (overrides program spec §4 Decision 7). **Read-only** prod queries via `supabase db query --linked` are allowed and have been used during Pass 2 audits.

## Feature Status

| Area | State | Notes |
|---|---|---|
| Admin BOS (CRM, Master Schedule, Venue Spaces, Proposals) | ✅ Live | ~25-30 real AWKN pages |
| Voice / PAI / Vapi | ✅ Decommissioned | Pass 4 removed all source. Prod-side undeploy of vapi-server / vapi-webhook / property-ai / generate-whispers / reprocess-pai-email functions bundled with end-of-program cutover (Task 2.11). Bitwarden secrets cleanup pending (manual). |
| Payments (Stripe + Square + PayPal) | ✅ Live | Untested — no CI gates on money flows. Stripe `create-payment-link` configured but 0 payments processed. |
| SignWell webhook | 🟡 Empirically dead | Missing tables in prod; CTO question whether to delete or keep dormant |
| AlpacaPlayhouse residue (`/residents/`, IoT) | ✅ Mostly removed | Pass 2 deleted ~46k LOC. Last hot spot `property-ai/index.ts` rolls into Pass 4 with Vapi/PAI decommission. |
| Mobile app (`mobile/`) | ✅ Deleted 2026-05-03 | 1.1MB Capacitor 8 + iOS + Android, 100% IoT, never shipped. CTO confirmed delete. |
| `/directory/` page | 🟡 Phase 5 scaffolding | Schema mismatch in prod (app_users missing slug/bio/etc.); preserved for client portal rebuild |
| Public sites (`awknranch.com`, `within.center`) | 🟡 External | Squarespace + WordPress; Phases 3-4 migration |
| Client portal | ⏳ Not built | Phase 5 greenfield |

## Known Limitations

- ~30% of codebase was AlpacaPlayhouse residue — Passes 2+3 removed ~46k LOC (1930+ files). Remaining: Pass 4 Vapi/PAI decommission (which absorbs `property-ai/index.ts` + 3 admin pages + faq surgery).
- No tests, no TypeScript, no CI gates on money handlers — addressed incrementally as each phase touches the relevant code.
- Founder's personal Google account owns prod assets (Resend, R2, DO droplet) — bus-factor risk.
- IA mid-refactor — Pillar model (Ranch / Within / Retreat / Venue) being introduced; events/schedule pages overlap. Should freeze before Phase 6. Pass 3 tags each page with its pillar as it audits.
- AWKN profile system (`/directory/`) has a schema gap — `app_users` is missing the columns the page queries (`slug`, `bio`, `pronouns`, etc.). Phase 5 will close the gap.

## Recent Changes (last 5)

| Date | Change | Author |
|---|---|---|
| 2026-05-03 | **Pass 4 complete (this session):** Wholesale Vapi/PAI/AlpaClaw decommission. 4 batches, 22 files, ~9,500 LOC removed. (A) 13 wholesale deletes (`e4ea7abb`): 5 edge functions (`property-ai`/`vapi-server`/`vapi-webhook`/`reprocess-pai-email`/`generate-whispers`), 6 admin pages (`ai-admin`/`pai-imagery`/`voice` html+js), 2 shared modules (`pai-widget`/`voice-service`). (B) Shell surgery (`4ec3e349`): admin-shell, resident-shell, feature-registry — strip nav entries, permissions, icons, feature defs. (C) Page surgery (`9d4e3d06`): faq.{html,js} (-615 LOC: voice config, impersonation, askViaPai), accounting.{html,js} (vapi vendor + PAI cost tracking), contact/index.html (1-line). (D) Webhook surgery (`acc506fe`): `resend-inbound-webhook/index.ts` 3563→2580 (-985 LOC); all 13 PAI/AlpaClaw functions removed; herd/payments/guestbook/claudero/forwarding flows preserved; PAI-routed classifier actions fall through to forward_admin. | Miceli |
| 2026-05-03 | **Pass 3 complete (this session):** 41 admin BOS pages audited across 7 chunks — 1 deletion total (`lifeofpaiadmin.html` broken redirect), 5 intentional legacy redirects preserved (Justin's design: testdev/devcontrol/manage/spaces/brand), 4 pages tagged for Pass 4 (PAI/Vapi cluster). Pillar tags: 4 Ranch / 2 Within / 1 Retreat / 1 Memberships / 1 Master / 28 Cross-cutting. New deliverable: `docs/superpowers/work/2026-05-03-page-pillar-tags.md`. | Miceli |
| 2026-05-03 | **Pass 2 functionally complete (this session):** 3 whole-file deletes (`mobile/` 1.1MB Capacitor IoT scaffolding; `feature-manifest.json` + `setup-alpacapps-infra` skill; `spaces/admin/inventory.{html,js}` 523-line Alpuca infra dashboard) — CTO chose delete-entirely over strip in all three cases. `property-ai/index.ts` (4019 lines) reclassified to Pass 4 wholesale delete (PAI moot per CTO 2026-05-03). Task 2.11 prod-side undeploy deferred to end-of-program cutover per prod-discipline rule. ~46k LOC removed across Pass 2's 20 commits. | Miceli |
| 2026-05-03 | Phase 1 Pass 2 first half (prior session): Tier 1 bulk deletes (build artifacts, `/residents/`, IoT pollers + edge functions, macOS dupes), Tier 2 surgery (login redirects, profile.html refs, shared shells, 24 admin context-switchers, 404 cleanup, branding rename, README + LICENSE rewrite, home-assistant-control delete). 17 commits, ~38k LOC. (`6267b816` → `a2cce3cd`) | Miceli |
| 2026-05-03 | Empirical prod-DB audit via Supabase Management API: zero users with role=resident/associate; SignWell tables mostly missing; 0 stripe_payments ever; app_users schema mismatched with /directory/ query. | Miceli |
