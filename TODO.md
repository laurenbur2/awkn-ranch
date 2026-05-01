# AWKN — TODO

> Roadmap context: `docs/ECOSYSTEM-MAP.md`. CTO directives drive all priorities.

## Critical (blocks production)

### CTO decisions blocking the alpaca purge (@miceli)
The 5-batch deletion plan in ECOSYSTEM-MAP.md cannot start Batch 2+ until these are answered:

- [ ] **Vehicles table fate** — Drop `vehicles` (Tesla-flavored) or keep for AWKN use (golf carts, employee fleet, guest assignment)?
- [ ] **PAI's new identity** — After stripping IoT inventory queries, what should PAI be? (Retreat-guest concierge / staff CRM helper / something else)
- [ ] **New default landing page** — Replaces `/residents/cameras.html` in `login/app.js:90`. Options: `/spaces/admin/`, role-aware, `/portal/`, master-schedule.
- [ ] **profile.html destination** — Stripe (`create-payment-link/index.ts:128`) and SignWell (`signwell-webhook/index.ts:597,628,900`) email URLs depend on this. Rewrite in place vs redirect to new `/portal/profile`.
- [ ] **Alpaca Mac LaunchAgents** — `Sonos HTTP API`, `WiZ Proxy`, `Music Assistant`, `Printer Proxy`, `spirit-whisper-worker`, `sonos-schedule-runner` — confirm Mac can be turned off.
- [ ] **Confirmation: never delete past migrations** — plan is to add a NEW `<date>_drop_alpaca_iot_tables.sql` migration. (assumed yes — flagging for explicit signoff)

### Deploy backlog
- [ ] Open PR `miceli` → `main`. ~28 commits (incl. this session's 2 doc commits) not yet shipped to production. `version.json` last bump 2026-04-02.

## Bugs (broken functionality)

_(none flagged this session)_

## Tech Debt (code quality)

### Alpaca residue (high — scheduled deletion, see ECOSYSTEM-MAP.md "Vestigial scope")
- [ ] **Batch 1 — Externals + safe deletes** (low risk, ~12 edge fns + 4 worker dirs + alpaca template skill). Recommended next-session start.
- [ ] **Batch 2 — Login + payment surgery** (high risk: live Stripe + SignWell flows)
- [ ] **Batch 3 — Shell + UI surgery** (~10 files: shells, feature manifest, users.js IoT permissions, inventory.js, voice.html, mobile default tab)
- [ ] **Batch 4 — PAI prompt rewrite** (~6 edge fns: property-ai, vapi-server, ask-question, generate-whispers, resend-inbound-webhook, _shared/email-classifier)
- [ ] **Batch 5 — Bulk delete + DB drop migration** (after 1-4 merged: `rm -rf /residents/`, ~69 IoT vendor files, `shared/resident-shell.js`, `shared/services/resident-device-scope.js`, doc scrubs)

### Repo hygiene
- [ ] Purge `.next/` and `/out/` directories tracked in git from abandoned prior Next.js attempt
- [ ] Dedupe `*2.md` macOS-duplicate files (`CLAUDE-TEMPLATE 2.md`, `SECRETS-BITWARDEN 2.md`, `LOCAL-AI-SETUP 2.md`, `TESTING-GUIDE 2.md`, `alpacappsinfra 2.html`, `20260331_create_spaces_and_ranch_house 2.sql`, etc.)
- [ ] Finish branding rename: `package.json` name still `your-app-infra`, R2 bucket `your-app`, README has `USERNAME/REPO` placeholder
- [ ] Kill stale branches: `claude/romantic-maxwell`, `fix/remove-external-service-ci`, `founder-ideas`, `hero-update`

### Quality gates
- [ ] No tests / no TypeScript / no CI gates on money handlers (Stripe, Square, PayPal). Add at least smoke tests for payment edge functions.
- [ ] Audit auto-merge agentic systems (Bug Scout, Feature Builder) — they push to `main` without visible governance

### Infra ownership
- [ ] Migrate Resend, Cloudflare R2, DigitalOcean droplet from founder's personal Google account (`wingsiebird@gmail.com`) to a business workspace

### Pillar model
- [ ] Lock in the Ranch / Within / Retreat / Venue pillar model BEFORE any public-site rebuild — marketing IA needs to inherit it. Consolidate overlapping pages: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`.

## Enhancements (nice to have)

### From ECOSYSTEM-MAP.md roadmap
- [ ] **Phase 1 — Funnel fix.** Implement `crm_leads` write-path with UTM capture; new `lead_intake` edge function. Rewrite Squarespace `/privatevents` and `/collaborations` forms (still on Squarespace) to POST to Supabase. Single highest-leverage architectural change.
- [ ] **Phase 2 — within.center SEO triage.** Pull Ahrefs / SEMrush per-URL traffic; identify the 5-10% of ~410 programmatic location pages that earn traffic; bulk-redirect-and-deindex the rest before Google penalty hits under Site Reputation Abuse / Helpful Content.
- [ ] **Phase 3 — `awknranch.com` Next.js rebuild** (replace Squarespace; 15 marketing + 49 events + MDX blog scaffold + B2B forms → `crm_leads`)
- [ ] **Phase 4 — `within.center` Next.js rebuild** (replace WordPress; migrate 51 real blog posts; kill ~410 programmatic pages with redirects; Article + LocalBusiness + FAQPage schema)
- [ ] **Phase 5 — Client portal MVP** (greenfield Next.js; Bookings, Pay, Sign, Pre-Arrival, Messages, Schedule, Receipts)
- [ ] **Phase 6 — EMR + greenfield admin modules** (BI dashboards, housekeeping turn boards, capacity/yield manager, EMR isolation decision)

### Side decisions to make
- [ ] **Pricing inconsistency on awknranch.com** — `/membership` $199, `/offerings2` $119/$149/$349, `/membership-1` $144/$199/$444. Reconcile during content audit.
- [ ] **Event platform consolidation** — Eventbrite / Partiful / Luma / direct Stripe / Recess all live. Pick one or two.
- [ ] **EMR strategy** — stay on Tellescope (cheap, HIPAA-compliant) or invest in in-house? Affects portal scope.
- [ ] **CRM consolidation** — does within.center's LeadConnector / GoHighLevel CRM eventually fold into the AWKN admin BOS?
- [ ] **Subdomain shape** — unified `app.*` vs separate apps per brand
- [ ] **within.center blog authorship post-migration** — MDX (engineers) vs headless CMS (clinicians)

## Resumption Pointers (for next session)

When picking this back up, the fastest paths to value:

1. **Read `docs/ECOSYSTEM-MAP.md`** end-to-end (~15 min) — full context.
2. **Answer the 6 CTO questions in Critical** above — unblocks the alpaca purge.
3. **Run Batch 1 of the deletion manifest** — low risk, visible progress, doesn't depend on the CTO answers.
4. The framework brainstorm (ruflo shared-memory adoption into `~/.claude/FRAMEWORK.md` multi-agent model) is **paused** pending validation. **Validation is in:** the 4-agent + 2-agent investigations this session both successfully shared findings via the `awkn-investigation` and `awkn-deletion-audit` ruflo memory namespaces. The shared-context-pool concept is real and works. Resume that brainstorm once the AWKN purge isn't the dominant priority.
