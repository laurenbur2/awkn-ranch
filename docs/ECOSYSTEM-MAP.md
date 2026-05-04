# AWKN Ecosystem Map

> **Purpose:** loaded on-demand for architecture decisions, scope questions, and "where does X belong" calls.
> **Last rewritten:** 2026-05-04 (Phase 1 Pass 6). The original 2026-04-28 investigation is superseded — its key recommendation ("do NOT migrate the BOS to Next.js") was reversed in the program spec.
> **Authoritative migration plan:** `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`.

## What AWKN is

One business with two consumer brands and one operating system:

| Brand | Domain | Role | Today |
|---|---|---|---|
| **AWKN Ranch** | `awknranch.com` | Austin retreat property — day-passes, memberships, retreats, events | Squarespace 7.1 |
| **Within Center** | `within.center` | Clinical brand — ketamine + inpatient retreats, lead gen, blog | WordPress on WP Engine |
| **AWKN BOS** | `laurenbur2.github.io/awkn-ranch/spaces/admin/` | Internal operating system — CRM, scheduling, accounting, agreements | Vanilla HTML/JS + Tailwind v4 + Supabase, deployed via GitHub Pages |

Common backend: **Supabase** (Postgres + Auth + Storage + Edge Functions). Prod project `lnqxarwqckpmirpmixcw` (West US Oregon). 70 public tables, ~50 deployed edge functions, ~120 RLS policies — all AWKN/Within Center after Phase 1 cleanup.

## Surface inventory (post Phase 1 Pass 1–6)

| Surface | Tech today | Pages | Owns data? |
|---|---|---|---|
| `awknranch.com` | Squarespace 7.1 | ~15 marketing + ~49 events (de-dupe target ~15) | **No** — leaks to Recess, Eventbrite, Partiful, Luma, Stripe, Squarespace inbox |
| `within.center` | WordPress / WP Engine (Salient theme) | 51 real blog posts + ~410 programmatic SEO + ~50 core | Partial — leads to LeadConnector (GHL); Tellescope handles HIPAA portal |
| Admin BOS (`spaces/admin/`) | Vanilla HTML/JS + Tailwind v4 + Supabase | 38 admin pages (per Pass 3 audit) | **Yes** — Postgres source of truth |
| Self-service payment (`pay/`) | Same shell + Stripe Elements | 1 | Yes |
| Internal dev dashboard (`clauded/`) | Same shell + Cloudflare D1 logging | 4 | Yes |
| Email approval flow (`admin/`) | Static + Supabase | 2 | Yes |

The `directory/` page is **AWKN-scaffolding for the future client portal** — preserved through Phase 1, rebuilt in Phase 5. `app_users` is currently missing the columns `directory/` queries (`slug`, `bio`, `pronouns`) — Phase 5 closes that gap.

## Pillar model (mid-refactor)

The IA is being reorganized around four pillars: **Ranch / Within / Retreat / Venue.** Pages and tables are consolidating against this. Phase 3 (`awknranch.com` rebuild) and Phase 6 (BOS migration) both depend on the Pillar model being locked first. Pass 3 produced page-pillar tags at `docs/superpowers/work/2026-05-03-page-pillar-tags.md`.

Overlapping surfaces still to consolidate: `events`, `schedule`, `scheduling`, `within-schedule`, `retreat-house`.

## Migration target architecture

The program spec commits to a **single Next.js monorepo** that hosts all four primary surfaces, with `spaces/admin/` (legacy vanilla BOS) running in parallel until Phase 6 cutover.

```
/
├── apps/
│   ├── awknranch/     # Phase 3 — replaces Squarespace
│   ├── within/        # Phase 4 — replaces WordPress + SEO triage
│   ├── portal/        # Phase 5 — greenfield client portal
│   └── bos/           # Phase 6 — replaces spaces/admin/ (visual parity)
├── packages/
│   ├── ui/            # shadcn components, Tailwind preset, design tokens
│   ├── db/            # Drizzle schema (introspected from Supabase)
│   ├── auth/          # Supabase Auth helpers, role guards
│   ├── api/           # shared tRPC routers
│   └── config/        # eslint, prettier, tsconfig, tailwind base
├── spaces/admin/      # legacy vanilla BOS — STAYS until Phase 6
└── ...
```

Stack per `~/.claude/FRAMEWORK.md`: Next.js 16 (App Router) + tRPC + Drizzle + Supabase Auth + Tailwind v4 + shadcn/ui. pnpm workspaces + Turborepo at the root.

## The funnel fix (highest-leverage architectural change)

Every public form on `awknranch.com` and `within.center` should write a `crm_leads` row first; email-to-staff is the side-effect. UTM source captured client-side and attached. This single change is more valuable than the cosmetic site rebuild — it lands in Phase 3 (awknranch) and Phase 4 (within).

## Within Center programmatic-SEO triage (gates Phase 4)

`within.center` has ~410 programmatic location pages (`/healing-retreat-locationslug-2/`) claiming residents in non-Austin cities can use Within Center, despite Austin being the only physical location. **This is exactly what Google's [Site Reputation Abuse](https://developers.google.com/search/blog/2024/03/site-reputation-abuse) and Helpful Content updates target** — likely an existing or imminent penalty risk.

Pre-Phase-4 step: pull Ahrefs / SEMrush per-URL traffic. Keep the ~5–10% that earn traffic (rewrite as Austin-only). Bulk 301-redirect-and-deindex the rest.

## External services (post-cleanup scope)

Surviving in scope:
- **Payments:** Stripe, Square, PayPal
- **Messaging:** Resend (email), Telnyx (SMS), Meta WhatsApp
- **Documents:** SignWell (e-signatures)
- **AI:** Gemini (image gen, payment matching, weather, classification, daily content), OpenRouter (alternative LLM gateway)
- **HIPAA portal:** Tellescope (Within Center, deep-link)
- **Storage:** Cloudflare R2 (bucket name `your-app` is template residue — rename pending)
- **Calendars:** Google Calendar (staff), Airbnb iCal (in/out)
- **Search:** Brave (paused — was PAI-only, decommissioned)
- **Event platform:** Eventbrite + Partiful + Luma + Recess + direct Stripe (Phase 3 consolidates to one or two)

Decommissioned in Phase 1:
- All IoT integrations (Govee, Nest, Tesla, Sonos, LG, Anova, Glowforge, FlashForge, UniFi cameras + go2rtc, Spotify, Hostinger OpenClaw chatbot, Camera Talkback)
- Vapi voice AI + PAI Discord bot + property-ai edge function
- Home server LAN bridge (Tailscale)
- DigitalOcean droplet pollers (Tesla, LG)

## Top architectural risks (cross-cutting)

These need attention regardless of phase ordering:

1. **Bus-factor risk** — Resend, Cloudflare R2, DigitalOcean droplet on founder's personal Google account (`wingsiebird@gmail.com`). Migrate to a business workspace.
2. **No tests, no TypeScript, no CI gates on money flows** — Stripe/Square/PayPal handlers have zero test coverage. Each phase that touches money adds coverage for that path.
3. **Auto-merge agentic systems push to `main`** — Bug Scout / Feature Builder bypass review. Must pause/repoint before Phase 6 (BOS migration). Cross-cutting TODO.
4. **Hardcoded `SUPABASE_ANON_KEY` JWTs** at 6 sites in `crm.js` + `clients.js` — should import from `shared/supabase.js`. Hygiene, not security (anon key is public).
5. **R2 bucket name `your-app`** — template residue hardcoded in 4 active files. Rename pending.
6. **Schema drift** — code references tables that don't exist in prod (`signwell_config`, `lease_templates`, `rental_applications`, `event_hosting_requests`, `weather_config`). Phase 2–6 reconciles per surface.

## Open questions per phase

- **Phase 2 (monorepo scaffold):** Vercel team account ownership, CI/CD specifics
- **Phase 3 (awknranch rebuild):** canonical membership pricing (3 pages currently disagree: $199 / $119–$349 / $144–$444), event platform consolidation, Squarespace asset migration approach
- **Phase 4 (within rebuild):** MDX vs headless CMS for the 51 blog posts (depends on who writes post-migration), LeadConnector cutover plan
- **Phase 5 (portal MVP):** unified `app.*` vs per-brand `portal.*` subdomain
- **Phase 6 (BOS migration):** Pillar model freeze date, pause/repoint plan for Bug Scout / Feature Builder, per-page time estimates
- **Phase 7 (CGC):** tool selection
- **Cross-cutting:** SignWell webhook status (COO call — empirically dead in prod, determines delete vs dormant), `/directory/` historical intent (treat as Phase 5 scaffolding)

## Where to look

| Question | Document |
|---|---|
| What's the migration plan? | `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md` |
| What's currently happening on `miceli`? | `STATUS.md` |
| What's left to do? | `TODO.md` |
| What's in the prod DB? | `docs/superpowers/work/2026-05-04-prod-db-audit.md` + `docs/SCHEMA.md` (with drift warning) |
| Where's a specific file? | `docs/KEY-FILES.md` |
| What's hooked up to what external service? | `docs/INTEGRATIONS.md` |
| How do styles work? | `docs/PATTERNS.md` |
| How does deploy work? | `docs/DEPLOY.md` |
| What did we just delete? | `docs/superpowers/work/2026-05-03-alpaca-inventory.md` (the deletion manifest) |
