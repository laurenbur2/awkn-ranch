# AWKN Ecosystem Map

> Investigation conducted on `miceli` branch, 2026-04-28, via 4 parallel agents writing into a shared ruflo memory pool.
>
> **Audience:** Matthew (CTO). Decision-oriented, not exhaustive. Source data in ruflo namespace `awkn-investigation`.

## TL;DR

AWKN is **one business with two consumer brands** (Within Center = clinical, AWKN Ranch = retreat property) backed by a surprisingly mature custom BOS. The four highest-leverage moves are:

1. **Rebuild `awknranch.com` and `within.center` in Next.js** — small page counts, big SEO/conversion upside, and (most importantly) **flip the data funnel** so public forms write to the BOS first and email staff second.
2. **Kill ~80% of within.center's ~410 programmatic SEO location pages** before they trigger Google's Helpful Content / Site Reputation Abuse penalties. Migrate the 51 real blog posts.
3. **Do NOT migrate the existing admin BOS to Next.js.** It's 45+ pages of working code on a fast deploy loop. Migration is months of churn for marginal benefit. Use Next.js *only* for **greenfield** modules going forward.
4. **Greenfield in Next.js**: client portal, BI/KPI dashboards, capacity/yield manager, and a hardened EMR (separate deployment, separate auth boundary).

Common backend stays Supabase — it's already deeply instrumented (57 migrations, 79 edge functions).

## Three corrections to working assumptions

| Assumption | Reality |
|---|---|
| `within.center` is on Wix, with thousands of blog pages | **WordPress on WP Engine. ~513 total URLs.** 51 real blog posts + ~410 templated programmatic SEO pages. REST API makes content extraction trivial vs. Wix. |
| Admin BOS is "vanilla HTML/JS + Supabase" (per CLAUDE.md) | Technically vanilla, but **it's a sprawling app**: ~25-30 *real* AWKN admin pages, 50+ shared modules, integrations across Stripe/Square/PayPal/Resend/Telnyx/WhatsApp/SignWell/Vapi/Gemini/Brave. Production-grade despite no framework. |
| The smart-home / IoT stack and `/residents/` pages are AWKN scope | **AlpacaPlayhouse residue.** This codebase was forked from `rsonnad/alpacapps-infra` and inherited a tenant-IoT operating model that has nothing to do with AWKN Ranch or Within Center. Scheduled for deletion. See "Vestigial scope" below. |

## Vestigial scope (AlpacaPlayhouse residue — scheduled for deletion)

Roughly 30% of the codebase is leftover from the seed project (`alpacapps-infra` template, originally for AlpacaPlayhouse — a tenant/short-term-rental IoT play). None of it serves AWKN. Inventory:

| Category | Examples | Action |
|---|---|---|
| Resident/tenant UI | `/residents/` (~30+ pages: IoT control surfaces) | Delete |
| Smart-home integrations | Govee, Sonos, Nest, Tesla, LG ThinQ, Anova oven, Glowforge, FlashForge 3D printer, go2rtc/UniFi cameras | Delete code + deprecate Supabase edge functions + drop tables |
| Home-server LAN bridge | Tailscale-bridged on-premise server for IoT polling | Decommission (also resolves the SPOF risk previously listed) |
| Workers | `tesla-poller`, `lg-poller`, IoT-related entries on the DigitalOcean droplet | Stop + remove |
| Edge functions | `govee_*`, `nest_*`, `tesla_*`, IoT bridges | Deprecate + delete |
| DB tables | `govee_devices`, `nest_devices`, `tesla_accounts`, `tesla_vehicles`, `lg_appliances`, `anova_ovens`, `glowforge_machines`, `printer_devices`, `sonos_*`, `camera_streams` | Drop after data export confirms zero AWKN usage |
| Template scaffolding | `setup-alpacapps-infra` skill references in CLAUDE.md, `infra/infra-upgrade-guide.md`, R2 bucket `your-app`, `package.json` name `your-app-infra`, `.next/` and `/out/` from a previous abandoned Next.js attempt | Strip + rebrand |

**Net effect of purge:** smaller surface area, the home-server SPOF risk evaporates, the founder's-personal-Google-account bus-factor risk shrinks (most of those credentials power IoT), and the codebase truly matches its CLAUDE.md framing.

A precise deletion manifest (with cross-reference verification) is the next deliverable on `miceli`.

## Surface inventory

| Surface | Tech today | Pages | Role | Owns data? |
|---|---|---|---|---|
| `awknranch.com` | Squarespace 7.1 | ~68 (15 marketing + 49 events) | Retreat marketing, day-pass + membership sales, event registration | **No** — leaks to Recess, Eventbrite, Partiful, Luma, Stripe, Squarespace inbox |
| `within.center` | WordPress on WP Engine (Salient theme) | ~513 (51 blog + ~410 programmatic + ~50 core) | Clinical brand, lead gen for ketamine/inpatient retreats, podcast | **Partial** — leads → LeadConnector (GHL CRM); patient portal is Tellescope (HIPAA-compliant external) |
| Admin BOS (`laurenbur2.github.io/awkn-ranch/spaces/admin/`) | Vanilla HTML/JS + Tailwind v4 + Supabase | ~25-30 real admin pages (after alpaca purge) | The actual operating system | **Yes** — Postgres source of truth |
| `/residents/` (vestigial) | Same shell | ~30+ pages | AlpacaPlayhouse tenant IoT | Scheduled for deletion |
| `/within/emr/` | Same admin shell | scaffolding only | Within Center EMR (HIPAA territory) | TBD — currently leans on Tellescope |
| `/pay/` | Same admin shell | small | Payment links | Yes |
| `/clauded/` | Same admin shell | small | Internal dev dashboard | Yes |

## Per-surface decision: where Next.js earns its complexity

### ✅ `awknranch.com` → New Next.js app (replace Squarespace)

**Verdict: Strong yes.**

- ~15 unique marketing pages (after de-duping) + 49 event detail pages — perfectly sized for Next.js with ISR for events.
- Current SEO is **weak** (no blog, slug hashes like `events/event-name-23423`, duplicate content from `/membership` vs `/membership-1`, no Event/LocalBusiness JSON-LD). A clean Next.js rebuild with proper schema, MDX/CMS-driven blog, and canonical URLs is a real organic-acquisition unlock.
- The two B2B inquiry forms (`/privatevents`, `/collaborations`) are the highest-leverage migration win — currently they go to an inbox, ideally they POST a `crm_leads` row directly.
- Squarespace lock-in is shallow: no Member Areas, no Squarespace Scheduling. Replacing pages, image hosting, forms, and the `/offerings2` cart is straightforward.
- External services that survive regardless: Recess (day passes), Eventbrite/Partiful/Luma (consider consolidating into one), Stripe.

**Stack:** Next.js 15-16 + Tailwind + shadcn/ui + Supabase (write directly via tRPC or server actions to existing tables). Per the unified framework.

**Migration plan sketch:** Build the 15 marketing pages + a typed Event detail template. Migrate event content via a one-time CSV/script. Set up canonical 301 redirects for event slugs. Add MDX blog scaffolding (probably empty at first). Cutover with DNS swap.

### ✅ `within.center` → New Next.js app (replace WordPress) — but kill the programmatic pages first

**Verdict: Yes, with strategy.**

The challenge isn't migration mechanics (WordPress REST API + Salient shortcodes can be parsed; bigger pain is just to rewrite pages from scratch using the existing copy). The challenge is **content triage**:

- **Migrate (51 posts)**: real hand-authored blog content from named clinicians, ~1,000-1,200 words each, May 2025 – Feb 2026, ~5/month cadence. Strong voice. Worth porting into MDX or a headless CMS.
- **Kill (~410 pages)**: programmatic SEO location pages. URLs literally leak template tokens (`/healing-retreat-locationslug-2/`, `/couples-retreat-locationname/`). Body copy claims residents in cities other than Austin can use Within Center, despite Austin being the only physical location. **This pattern is exactly what Google's [Site Reputation Abuse](https://developers.google.com/search/blog/2024/03/site-reputation-abuse) and Helpful Content updates target.** Likely an existing or imminent penalty risk.
- **Pre-migration step**: pull Ahrefs / SEMrush organic-traffic data per page. Keep the ~5-10% that actually rank and earn traffic. Broad-redirect the rest to relevant `/services/` or `/blog/` pages.

**Stack:** Next.js 15-16 + Tailwind + shadcn/ui + MDX (or Sanity/Payload if non-engineers will write). Tellescope deep-link stays. WPForms → Supabase `crm_leads` (parallel write to LeadConnector during transition, then drop GHL).

**SEO posture upgrade:** Article + FAQPage + LocalBusiness schema; `next-sitemap`; clean URLs; proper internal linking.

### ❌ Admin BOS → Do NOT migrate

**Verdict: Strong no.**

This is the most important "no" in this document. Reasons:

- ~45 admin pages × the cost of rewriting each ≈ months of work for **no user-facing benefit**. The current vanilla pages already work, deploy in seconds (push to main → live), and have years of accumulated business logic.
- The BOS is **heterogeneous on purpose**: each admin page is a focused tool, not a unified app. Vanilla HTML+JS is actually well-matched to that — every page is independently deployable and debuggable.
- The unified framework (`~/.claude/FRAMEWORK.md`) recommends Next.js + tRPC + Drizzle, but it also has a **CONSISTENCY > NOVELTY** principle. Rewriting working code isn't consistent with that.
- **Exception**: greenfield modules with strong justification (real-time, complex client-side state, auth-sensitive UX) can be Next.js-based and embedded as separate deployments behind a unified subdomain or path. Examples below.

**What this means in practice:** keep `/spaces/admin/` exactly as it is. Don't try to "modernize" it. New modules get evaluated on their own merits.

### ✅ Client portal → New Next.js app

**Verdict: Yes (greenfield).**

- Customer-facing — needs polish, mobile-perfect, accessible.
- Reusable building blocks already exist server-side: Supabase auth + `people`/`assignments`/`ledger` tables + `verify-identity` edge function + SignWell integration + payment links infrastructure.
- MVP scope (per Agent D): **My Bookings, Pay Balance, Sign Documents, Pre-Arrival Checklist, Messages (read-only), My Schedule, Receipts.** Cut at "reduce inbound staff load."
- Out of MVP: self-serve booking, real-time chat, community feed, loyalty.

**Stack:** Next.js + Supabase Auth + Drizzle (against existing tables) + tRPC + Tailwind + shadcn. Hosted at `portal.awknranch.com` or `portal.within.center` (or both, with a brand-aware shell).

### 🟨 Within Center EMR → Next.js, but separate deployment

**Verdict: Yes, with isolation.**

- HIPAA territory. Should be its own deployment with its own auth boundary, audit log, and PHI segmentation. Don't co-mingle with marketing or admin in the same Next.js codebase.
- Alternative: keep using **Tellescope** as the patient-facing portal (already HIPAA-compliant, already integrated) and limit "EMR-in-house" to staff-facing clinical workflows. Cheaper and lower-risk.
- Decision deferred to a separate scoping pass — flag for explicit CTO discussion.

### 🟨 Greenfield admin modules → Case-by-case

Strong candidates for Next.js (rather than vanilla-HTML extension of `/spaces/admin/`):
- **BI/KPI dashboards** (occupancy %, RevPAR, conversion, LTV, contribution margin) — heavy client-side state, charts.
- **Housekeeping turn boards** — real-time updates, mobile-first for housekeeping staff.
- **Capacity / yield manager + waitlists** — complex calendar interactions.

Lukewarm candidates (probably stay vanilla):
- Audit log viewer, simple CRUD admin, lookup tools.

## Recommended architecture

```
                              ┌─────────────────────────────┐
                              │         Supabase            │
                              │  Postgres (RLS) + Auth +    │
                              │  Storage + 79 Edge Fns      │
                              └─────────────────────────────┘
                                  ▲      ▲      ▲      ▲
            ┌─────────────────────┘      │      │      └─────────────────────┐
            │           ┌────────────────┘      └────────────────┐           │
            │           │                                        │           │
   ┌────────────────┐ ┌──────────────────┐ ┌─────────────────┐ ┌───────────────────┐
   │ awknranch.com  │ │  within.center   │ │  Admin BOS      │ │ portal.* (new)    │
   │ Next.js        │ │  Next.js         │ │  Vanilla HTML/  │ │ Next.js           │
   │ Marketing +    │ │  Marketing +     │ │  JS + Tailwind  │ │ Client portal:    │
   │ events + B2B   │ │  blog + clinical │ │  GitHub Pages   │ │ bookings, pay,    │
   │ inquiry        │ │  lead capture    │ │  (existing,     │ │ docs, messages    │
   │ (replaces      │ │  (replaces WP +  │ │  KEEP AS-IS)    │ │ (greenfield)      │
   │  Squarespace)  │ │  triages 410     │ │                 │ │                   │
   │                │ │  programmatic    │ │                 │ │                   │
   │                │ │  pages)          │ │                 │ │                   │
   └────────────────┘ └──────────────────┘ └─────────────────┘ └───────────────────┘

   External (stays):
     Tellescope (HIPAA portal — deep-link from within.center)
     Recess (day passes)
     SignWell, Stripe, Square, PayPal
     Resend, Telnyx, Vapi, WhatsApp
```

**Auth strategy:** All four Next.js apps use Supabase Auth against the existing `app_users` table + role enum (admin/staff/resident/associate/oracle/demo). Add a `client` role for portal users. Domain-specific subroles via row-level metadata.

**The funnel fix (most important architectural change):** Every public form on awknranch.com and within.center writes a `crm_leads` row first; email-to-staff is a side-effect of the insert (via existing `inbound_emails` triggers or a new `on_lead_created` edge function). UTM source captured client-side in localStorage and attached. This single change is more valuable than the cosmetic site rebuild.

## Top architectural risks (from codebase audit)

These need attention regardless of the Next.js decision:

1. **Bus-factor risk** — Resend, Cloudflare R2, DigitalOcean droplet on founder's personal Google account (`wingsiebird@gmail.com`). Migrate to a business workspace.
2. ~~Single-point-of-failure home server~~ — **resolves automatically once AlpacaPlayhouse residue is purged.** All IoT/talkback/camera dependencies are vestigial.
3. **Stale deploy** — `version.json` from 2026-04-02; 26 commits on `miceli` not yet on main. The deploy loop is not getting exercised.
4. **No tests, no TypeScript, no CI gates on money flows** — Stripe/Square/PayPal handlers have zero test coverage.
5. **Build artifacts in git** — `/.next/` and `/out/` directories tracked from a stale merge with no Next.js source. Suggests a previous Next.js migration attempt that was abandoned. Purge before any new attempt.
6. **`.macOS-duplicate` files everywhere** — `CLAUDE-TEMPLATE 2.md`, `SECRETS-BITWARDEN 2.md`, etc. cleanup before any audit.
7. **Auto-merge agentic systems push to main** — Bug Scout / Feature Builder agents bypass review. Worth auditing what they actually merge.
8. **IA mid-refactor** — Pillar model (Ranch/Within/Retreat/Venue) being introduced; events / schedule / scheduling / within-schedule / retreat-house all overlap. Don't migrate websites until the IA stabilizes — they'll inherit the confusion.
9. **Half-templated branding** — `package.json` is still `your-app-infra`, R2 bucket is `your-app`, README has `USERNAME/REPO`. Fix during routine hygiene.
10. **Pricing inconsistency on awknranch.com** — `/membership` says $199, `/offerings2` says $119/$149/$349, `/membership-1` says $144/$199/$444. Fix as part of migration content audit.

## Recommended phased roadmap

| Phase | Theme | Duration estimate |
|---|---|---|
| **0. Hygiene + alpaca purge** | Delete `/residents/`, IoT integrations (Govee/Nest/Tesla/Sonos/LG/Anova/Glowforge/FlashForge/cameras), associated edge fns + DB tables, IoT workers; purge `.next/`/`/out/`, dedupe `*2.md` files, finish branding rename, drain `miceli` → main, kill stale branches | 1-2 sprints |
| **1. Funnel fix** | Implement `crm_leads` write-path with UTM capture; add a `lead_intake` edge function; rewrite Squarespace `/privatevents` and `/collaborations` forms (still on Squarespace, posting to Supabase) | 1 sprint |
| **2. SEO triage on within.center** | Pull Ahrefs/SEMrush per-URL traffic; identify the 5-10% of programmatic pages that earn traffic; bulk-redirect-and-deindex the rest | 1 sprint |
| **3. `awknranch.com` Next.js rebuild** | 15 marketing + Event template + MDX blog scaffold + B2B forms → `crm_leads` | 3-4 sprints |
| **4. `within.center` Next.js rebuild** | Marketing + service pages + 51 blog posts migrated + lead capture | 3-4 sprints |
| **5. Client portal MVP** | Bookings, Pay, Sign, Pre-Arrival, Messages, Schedule, Receipts | 4-6 sprints |
| **6. EMR scoping + greenfield modules** | EMR isolation decision; BI dashboards; housekeeping; capacity/yield | TBD |

Phases 1, 2, 3 can run in parallel across multiple devs (multi-dev branch model).

## Open questions for the CTO

1. **EMR strategy:** stay on Tellescope (cheap, safe, HIPAA-compliant) or invest in in-house EMR (more control, higher liability)? Affects portal scope.
2. **CRM strategy:** is LeadConnector / GoHighLevel staying on within.center long-term, or does it eventually fold into the AWKN admin BOS? Affects funnel design.
3. **Subdomain strategy:** unified `app.*` vs separate apps per brand? Affects auth, routing, brand expression in the portal.
4. **Event platform consolidation:** Eventbrite / Partiful / Luma / direct Stripe / Recess. Pick one or two.
5. **Pillar model definition:** lock in the Ranch / Within / Retreat / Venue schema *before* either site rebuild — the marketing IA needs to inherit it.
6. **Who writes the within.center blog** post-migration? MDX (engineers) vs headless CMS (clinicians) is the real choice.

## Appendix: investigation methodology

This audit was produced by 4 parallel Claude subagents writing into a shared ruflo memory pool (`awkn-investigation` namespace, 24 keys, HNSW vector backend, byzantine consensus mesh hive-mind). Each agent had access to the same MCP tooling and pushed structured findings independently; this document is the synthesis layer.

**Validates the ruflo "shared context pool" value proposition** — subagents were able to load deferred MCP tools (`ToolSearch select:mcp__ruflo__memory_store`) and round-trip through the shared namespace successfully. Memory persists across the session and across separate Claude processes via `sql.js + HNSW` backend.

To re-query findings:
```
mcp__ruflo__memory_search query:"<topic>" namespace:"awkn-investigation"
```
