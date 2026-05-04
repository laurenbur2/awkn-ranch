# Phase 1 — Alpaca Purge + Repo Hygiene — Design Spec

**Date:** 2026-05-03
**Author:** Matthew Miceli (`miceli`) + Claude
**Status:** Draft for user review
**Parent program spec:** `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`

**Refines / amends parent spec:**
- §4 Decision 7 — Phase 1 has **zero prod DB writes** (parent spec allowed `RENAME TO _deprecated_*` on prod; this spec defers all prod-DB writes to the end-of-program cutover).
- §4 Decision 8 — work commits **directly to `miceli`**, no `purge-alpaca` sub-branch (parent spec required a sub-branch + PR back to `miceli`).
- §7 — pass structure renamed and lightly resequenced: Inventory → Triage & Delete → Page Audit → Vapi → Audit + Local Clone + Droplet → Docs.

---

## 1. Context

The AWKN repo was forked from `rsonnad/alpacapps-infra` and inherited ~30% AlpacaPlayhouse tenant-IoT residue (~100 files, ~53k LOC). Phase 0 reset `miceli` to `origin/main` and restored project docs. Phase 1 is the surgical removal of that residue from code, edge functions, droplet workers, and the dev-time DB target — without touching the production database.

The current production Supabase has live client data and is mission-critical. Throughout Phase 1, prod stays read-only. Refactor work pivots to a local Postgres clone established in Pass 5.

## 2. Goals

1. Remove all AlpacaPlayhouse code (`/residents/`, IoT pollers, Mac home-server bridge code, identifiable IoT files).
2. Decommission Vapi voice agents wholesale (code + Supabase edge functions + env vars + Bitwarden entries).
3. Stop droplet IoT pollers (`tesla-poller`, `lg-poller`).
4. Stand up a local Supabase stack (`supabase start`) restored from a prod `pg_dump`. Becomes the dev target for Phases 2–6.
5. Audit prod DB read-only — document any residue, write a clean migration script for the future cutover, but apply nothing.
6. Surgical edits to AWKN files that referenced Alpaca (default landing page redirect, email-URL destinations, etc.) — case-by-case review.
7. Restore and update project docs to reflect the post-purge state.

## 3. Non-goals

- **No prod DB writes.** Vehicles drop, any other residue rename / drop — all deferred to the end-of-program cutover against the crystallized schema.
- **No Next.js scaffolding.** That's Phase 2.
- **No Pillar-model IA decisions.** Pages get *tagged* with pillar during Pass 3 (free intel for Phase 6) but the IA refactor itself stays deferred.
- **No new tests / TS / CI gates as dedicated Phase 1 work.** Test coverage grows incrementally per phase that touches code.

## 4. Decisions baked in

| # | Decision | Source |
|---|---|---|
| 1 | Vapi: decommission wholesale | User confirmed 2026-05-03 |
| 2 | `vehicles` table: drop, but **deferred to end-of-program cutover** (not Phase 1) | User direction 2026-05-03 + prod-DB discipline |
| 3 | PAI: moot — no rewrite path needed (Vapi gone) | Falls out of #1 |
| 4 | Mac LaunchAgents: irrelevant — no Mac running AWKN background processes | User confirmed 2026-05-03 |
| 5 | Phase 1 has zero prod DB writes | User direction 2026-05-03 (prod-DB discipline) |
| 6 | Work direct on `miceli`, no sub-branch | User direction 2026-05-03 |
| 7 | Local Postgres via `supabase start` is the dev target through Phases 2–6 | User direction 2026-05-03 |
| 8 | Tiered review (B): bulk-confirmable for obvious residue, per-file for AWKN-touching files | User chose option B 2026-05-03 |
| 9 | Page Audit chunked by current folder structure, with pillar tags applied as we go | User chose option C 2026-05-03 |

## 5. Open questions (will surface during review)

| # | Question | Where it surfaces | Required by |
|---|---|---|---|
| 1 | New default landing page — replaces `/residents/cameras.html` in `login/app.js:90`. Options: `/spaces/admin/`, role-aware, `/portal/`, master-schedule | Pass 2 Tier 2 review (when `login/app.js` is touched) | Pass 2 close |
| 2 | `profile.html` destination — Stripe `create-payment-link/index.ts:128` and SignWell `signwell-webhook/index.ts:597, 628, 900` email URLs depend on this | Pass 2 Tier 2 review | Pass 2 close |

**Protocol when a question surfaces:** Claude pauses review, shows exact file + line + current value + options with implications. User decides. Claude edits and continues.

## 6. Pass structure

Six passes, in order. Hard sequential dependencies: 1 → 2; 5a → 5b. Otherwise passes run sequentially because they share the working tree.

### Pass 1 — Inventory

**Goal:** complete catalog of every file referencing AlpacaPlayhouse / IoT / Vapi identifiers, auto-tiered.

**Steps:**
1. Run `grep -rn` (or `rg`) across the repo for the identifier set:
   - **Top-level IoT:** `govee`, `nest`, `tesla`, `lg`, `anova`, `glowforge`, `flashforge`, `printer`, `sonos`, `camera_streams`, `go2rtc`, `blink`, `wiz`, `music[_-]assistant`
   - **Tenant-IoT structure:** `residents/`, `your-app`, `alpaca`, `alpacaplayhouse`, `home-server`, `tailscale`
   - **Voice / agent:** `vapi`, `voice`, `pai`, `ask-pai`, `lifeofpai`, `spirit-whisper`
2. For each match, classify into:
   - **Tier 1 — bulk-confirmable**: file lives entirely under `/residents/`, or matches a top-level IoT name pattern, or is a poller/worker dir (`blink-poller`, `camera-event-poller`, `lg-poller`); has no inbound refs from non-Alpaca code.
   - **Tier 2 — per-file review**: AWKN code (e.g. `login/`, `spaces/admin/`, `supabase/functions/`) that *references* Alpaca code. These need surgery, not deletion.
3. Write the manifest to `docs/superpowers/work/2026-05-03-alpaca-inventory.md` — categorized by tier and by category within Tier 1.
4. Build a `.gitignore` patch in the same commit: add `.claude-flow/`, `.swarm/`, `.next/`, `/out/` (the latter two are stale build artifacts noted in the parent spec).

**Deliverables:**
- `docs/superpowers/work/2026-05-03-alpaca-inventory.md`
- Updated `.gitignore`

**Commits:** 1 (closing commit with manifest + gitignore)

**Exit:** manifest reviewed by user; tier breakdown approved before Pass 2.

### Pass 2 — Triage & Delete

**Goal:** delete or surgically edit every file in the manifest.

**Tier 1 flow** (per category):
1. Claude shows the category list (e.g. *"Tier 1 / `/residents/` directory: 47 files. No inbound refs from non-Alpaca code. List attached."*).
2. User confirms the category — *"nuke it"* / *"wait, let me see X first"* / *"hold this one"*.
3. Claude `git rm`s the category. One commit per category. Smoke test (`git push` → wait for Pages deploy → click 5–10 admin pages).
4. Move to next category.

**Expected Tier 1 categories** (from initial scan, refined in Pass 1):
- `/residents/` directory (whole tree)
- Top-level IoT files matching `govee_*`, `nest_*`, `tesla_*`, `lg_*`, `anova_*`, `glowforge_*`, `flashforge_*`, `printer_*`, `sonos_*`, `camera_streams_*`, `go2rtc_*`
- Poller/worker directories: `blink-poller`, `camera-event-poller`, `lg-poller`
- Build artifacts: `/.next/`, `/out/` (already gitignored after Pass 1)
- macOS dupes: `*2.md`, `* 2.html`, etc.
- Branding rename: `package.json` name (`your-app-infra` → `awkn-bos`), R2 bucket reference, README placeholders

**Tier 2 flow** (per file):
1. Claude opens the file, shows the relevant lines, the surrounding context, and the cross-refs that flagged it.
2. User decides: kill / keep-as-is / surgery.
3. If surgery: Claude makes the edit in the same turn. If user is unsure: pause, surface options (e.g. landing-page question, profile.html destination question), user decides, then edit.

**Expected Tier 2 files** (preliminary; Pass 1 inventory will be authoritative):
- `login/app.js` — default landing-page redirect (Question #1)
- `supabase/functions/create-payment-link/index.ts` — Stripe redirect URL (Question #2)
- `supabase/functions/signwell-webhook/index.ts` — multiple email-URL refs (Question #2)
- `supabase/functions/reprocess-pai-email/index.ts` — Vapi-related, deleted in Pass 4
- Any admin BOS files that import from `/residents/` or reference IoT tables (caught in Pass 3 too)

**Deliverables:** Tier 1 categories deleted; Tier 2 files edited or deleted as decided.

**Commits:** ~10–15 — one per Tier 1 category, smaller batches for Tier 2.

**Exit:** all Tier 1 categories cleared; all Tier 2 files have an explicit decision applied.

### Pass 3 — Page Audit

**Goal:** walk admin BOS pages folder-by-folder and clean up any Alpaca residue Pass 2's identifier grep didn't catch (off-name imports, hardcoded copy strings, cross-folder JS refs). Also tag each page with its pillar.

**Folder chunks** (one chunk per session ideally):
- `spaces/admin/crm/`
- `spaces/admin/master-schedule/`
- `spaces/admin/proposals/`
- `spaces/admin/clients/`
- `spaces/admin/venue-spaces/`
- Any other folders the inventory surfaces

**Per-page workflow:**
1. Claude opens the HTML and JS for the page.
2. Claude flags suspicious patterns: imports from deleted directories, role checks against deleted roles, copy strings mentioning IoT/Alpaca, asset paths to deleted images.
3. User confirms each flag — *"kill it"* / *"keep, that's actually AWKN"* / *"surgery"*.
4. Edits applied in the same turn.
5. Claude appends a pillar tag to a running list at `docs/superpowers/work/2026-05-03-page-pillar-tags.md`: page → pillar (Ranch / Within / Retreat / Venue / Cross-cutting).

**Pillar-tag format:**
```markdown
| Page | Folder | Pillar | Notes |
|---|---|---|---|
| crm/leads.html | crm/ | Cross-cutting | serves both Ranch + Within |
| master-schedule/events.html | master-schedule/ | Venue | Justin's recent multi-space work |
```

**Deliverables:** clean admin BOS folders; `docs/superpowers/work/2026-05-03-page-pillar-tags.md` (input to Phase 6 IA work).

**Commits:** ~5–7 — one per folder chunk.

**Exit:** every admin BOS page has been opened, audited, edited if needed, and pillar-tagged.

### Pass 4 — Vapi decommission

**Goal:** wholesale removal of Vapi / voice / PAI surface area. No rewrite path (PAI question moot per Decision #3).

**Steps:**
1. Cross-ref grep for `voice`, `vapi`, `pai`, `ask-pai`, `lifeofpai` to confirm scope. Should already be in Pass 1 manifest; this is sanity check.
2. Delete `voice.html`, `voice.js`, and any other voice-surface files in admin.
3. Decommission Supabase edge functions:
   - `supabase functions delete vapi-server`
   - `supabase functions delete vapi-webhook`
   - `supabase functions delete reprocess-pai-email`
4. Remove Vapi env vars from local `.env`, Supabase project secrets, GitHub Actions secrets.
5. Remove Vapi entries from Bitwarden vault (or the equivalent secrets store per `docs/SECRETS-BITWARDEN.md`).
6. Smoke test: BOS still loads, no console errors referencing `vapi`/`voice`/`pai`.

**Deliverables:** zero references to Vapi / voice / PAI in remaining code; edge functions removed from Supabase project; secrets cleaned up.

**Commits:** 2–3 — code removal, edge function commit (records the decommission decision in the repo even though the actual `functions delete` is a Supabase CLI action), env / secrets cleanup notes.

**Exit:** `grep -rn 'vapi\|voice\|pai' --include='*.{html,js,ts}'` returns clean (modulo unrelated false positives like the word "voice" in marketing copy — judgment call).

### Pass 5 — Audit + local clone + droplet

**Goal:** establish the local Postgres clone (always-on, regardless of audit findings); audit prod read-only; document the migration script for the eventual cutover; stop droplet IoT pollers.

**5a — Read-only prod audit:**
1. Connect to prod Supabase via `psql` (read-only role) or the Supabase dashboard.
2. List all tables, views, functions, RLS policies.
3. Cross-check against Pass 1 inventory for identifier matches.
4. Document findings in `docs/superpowers/work/2026-05-03-prod-db-audit.md`. Likely findings: `vehicles` table (Tesla-flavored), possibly Alpaca-specific tables that the user's hunch may have missed.

**5b — Local clone (always-on):**
1. Verify Docker / OrbStack is installed (Pass 5 prerequisite).
2. `pg_dump` prod via `supabase db dump` or direct `pg_dump` against the prod connection string.
3. `supabase init` in the AWKN repo (creates `supabase/` config; non-destructive — repo already has `supabase/` folder for edge functions, init augments it).
4. `supabase start` — spins up local Postgres + Auth + Storage + Edge Functions runtime + Studio in Docker.
5. `pg_restore` (or `psql -f dump.sql`) into the local stack.
6. Wire BOS env: introduce `config.local.js` (or env-flag in existing config) that points the Supabase JS client at `http://127.0.0.1:54321` with the local anon key. Keep prod config the default; local is opt-in via flag.
7. Smoke test: BOS pages load against the local stack.

**5c — Droplet pollers stop:**
1. SSH to the DigitalOcean droplet (creds per `docs/CREDENTIALS.md`).
2. Stop poller services: `tesla-poller`, `lg-poller`.
3. Disable them from auto-start.
4. Confirm BOS still works (these never served the BOS; sanity check).

**5d — Migration script for the future cutover (no execution):**
1. Based on the audit, write a clean migration script: `docs/migrations/2026-MM-DD-prod-cleanup-deferred.sql`. Includes the vehicles drop and any other residue removal.
2. Run the migration against the local clone to verify it works.
3. Mark the script "DEFERRED — apply only at end-of-program cutover."

**5e — Documentation:**
1. Write `docs/LOCAL-DEV.md` — the minimal setup guide. Sections: install OrbStack, dump prod, `supabase init` + `supabase start`, restore dump, env-var flip, `supabase functions serve` for edge functions, ngrok-style tunnel for webhook testing (deferred to later phases).
2. Add a one-line pointer in `CLAUDE.md` Quick Refs.

**Deliverables:**
- `docs/superpowers/work/2026-05-03-prod-db-audit.md` (audit findings)
- Local Supabase stack running on dev machine
- `docs/LOCAL-DEV.md` (minimal version)
- `CLAUDE.md` updated with local-dev pointer
- `docs/migrations/2026-MM-DD-prod-cleanup-deferred.sql` (rehearsed against local, NOT applied to prod)
- Droplet pollers stopped

**Commits:** 1–2 — audit + local-dev setup commit, droplet shutdown commit.

**Exit:**
- Prod DB untouched (verifiable from Supabase audit log).
- Local stack runs; BOS works against it.
- Migration script rehearsed locally and committed but unapplied.
- Droplet pollers no longer running.

### Pass 6 — Docs

**Goal:** project docs reflect post-purge reality.

**Steps:**
1. Update `STATUS.md` — feature status, recent changes, known limitations (drop the bullets about ~30% Alpaca residue and `/.next/` being tracked).
2. Update `TODO.md` — close out Phase 1 items, add Phase 2 prerequisites, archive resolved CTO questions.
3. Update `CLAUDE.md` — drop the "Vestigial scope — DO NOT EXTEND" section (it's no longer vestigial because it's no longer there); update Quick Refs.
4. Update `docs/ECOSYSTEM-MAP.md` — surface inventory now reflects post-purge state.
5. Delete `/Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/` insurance folder.
6. Bump version per `docs/DEPLOY.md`.

**Deliverables:** docs reflect post-purge state.

**Commits:** 1 — closing commit.

**Exit:** STATUS.md last-updated date is current; TODO.md has Phase 2 items; insurance folder deleted.

## 7. Workflow

### Branching

- All work commits directly to `miceli`.
- Periodic `git pull origin main` at session start to ingest teammate work (e.g. Justin's venue-events).
- No `purge-alpaca` sub-branch. No PRs back to `miceli` (it IS `miceli`).
- Don't merge `miceli` → `main` during the program.

### Commit cadence

Strategic, well-scoped commits. ~25–30 total across Phase 1.

| Pass | Expected commits |
|---|---|
| 1 — Inventory | 1 |
| 2 — Triage & Delete | ~10–15 (Tier 1 by category, Tier 2 in batches) |
| 3 — Page Audit | ~5–7 (one per folder chunk) |
| 4 — Vapi | 2–3 |
| 5 — Audit + local + droplet | 1–2 |
| 6 — Docs | 1 |

### Sessions

- Open with `/resume`, close with `/handoff`.
- `/smart-compact` if context fills mid-session.
- Pass boundaries are natural session boundaries when convenient.
- Estimated 9–12 sessions total — no rigid schedule.

### Push cadence

- Push at end of each session or end of each pass, whichever comes first.
- Don't push mid-pass unless we've crossed a logical unit boundary.
- GitHub Pages auto-deploys on push to `main` only. Pushes to `miceli` are a remote backup, not a deploy.

## 8. Risk and rollback

### Risk register

| Pass | Top risk | Mitigation |
|---|---|---|
| 1 | Manifest misses an identifier; later passes leave residue | Generous regex; cross-check ECOSYSTEM-MAP §3-4; surface ambiguous items in Tier 2 |
| 2 | Delete a file with non-obvious AWKN dependency | Tier-2 per-file review; smoke test after each Tier 1 category |
| 3 | Edit a page another dev (e.g. Justin) is touching | `git pull origin main` at session start; `gh pr list` before each folder chunk |
| 4 | Removing voice/Vapi breaks something downstream | Pre-deletion cross-ref grep; keep edge function source committed until pass closes |
| 5 | Local clone misconfiguration; accidental prod write | All Supabase CLI commands run against local URL; prod connection string only used for `pg_dump`; verify Supabase audit log shows only reads |
| Cross | Auto-merge agents (Bug Scout / Feature Builder) push to `main` and modify deleted files | Periodic `git pull origin main`; manual conflict resolve; flag in TODO if pattern persists |

### Smoke test cadence

GitHub Pages auto-deploys on push to `main` only — `miceli` doesn't get auto-deployed. Smoke tests run **locally** instead:

- **Before Pass 5 establishes the local Supabase stack:** serve the BOS via `python -m http.server 8080` (or `npx serve`) from the repo root and open in a browser. The BOS hits the prod Supabase via the JS client — fine because Pass 2 / Pass 3 only delete or edit code; prod DB stays untouched.
- **After Pass 5:** smoke tests target the local Supabase stack via the env-var flip.

Cadence:

- After each Tier 1 category in Pass 2: local serve; click through 5–10 representative admin pages.
- After each Page Audit folder chunk: visit every page in that folder via local serve.
- After Pass 4: `grep -rn 'vapi\|voice\|pai'` returns clean; voice nav entry no longer appears in admin sidebar; no console errors referencing Vapi.
- After Pass 5 droplet stop: BOS still works against prod (and against the new local stack — sanity check both).
- Final: full BOS walkthrough at end of Phase 1, against both prod and local stacks.

### Rollback posture

- Code: `git revert <sha>` per commit. Strategic commit cadence is what makes this clean. `git reflog` as 30-day escape hatch.
- Pass 5 droplet poller stop: reversible via `systemctl start <service>` on the droplet.
- Pass 5 prod DB: zero writes → zero rollback needed.

## 9. Exit criteria

- ✅ BOS deploys to GitHub Pages; ~25–30 admin pages smoke-test green.
- ✅ Codebase ~30% smaller (target: ~50k LOC removed).
- ✅ `grep -rn` for Alpaca / IoT identifiers returns clean.
- ✅ Vapi fully gone (code, edge functions, env vars, Bitwarden).
- ✅ Droplet IoT pollers stopped.
- ✅ Pass 5: prod audit doc + local Supabase stack running + clean migration script committed (unapplied) + `docs/LOCAL-DEV.md` published.
- ✅ Project docs reflect post-purge state.
- ✅ `awkn-pre-reset-2026-05-01/` insurance folder deleted.
- ✅ Zero prod DB writes performed (verifiable in Supabase audit log).

## 10. Cross-cutting concerns

### DB long-arc strategy

This Phase 1 spec establishes the local-clone pattern that runs through the entire refactor program:

- **Phase 1 Pass 5:** local clone established as dev target.
- **Phases 2–6:** all refactor work runs against the local clone. Frontend env-flips between local and prod as needed for testing. Prod stays untouched.
- **End of program:** the refactored code reveals which tables, columns, functions are *actually* used → that's the **crystallized schema**.
- **Cutover:** spin up a test Supabase matching the crystallized schema → verify parity → apply the diff to prod as a single deliberate migration.

This pattern overrides the parent spec's incremental cleanup approach.

### Coordination with `main`

`main` continues to receive teammate commits during Phase 1 (Justin's venue-events work, possibly auto-merge agent commits). Mitigation:

- `git pull origin main` at the start of every session.
- Before Pass 3 folder chunks: `gh pr list` to surface any open PRs that touch the folder we're about to audit.
- Conflicts: resolve manually. If an auto-merge agent re-introduces deleted Alpaca files mid-Phase-1, file an issue and consider pausing those agents (program-level TODO item).

### Auto-merge agents

The project has Bug Scout and Feature Builder agents that auto-merge to `main` (per ECOSYSTEM-MAP / TODO.md). They could re-introduce deleted Alpaca files if they reference them. This isn't a Phase 1 blocker but should be monitored. If it becomes a problem, pause/repoint those agents — that's already a TODO item for Phase 6 prep.

### Visibility into prod DB usage

Pass 5a's audit is read-only and produces a snapshot of *what's in prod*. It does NOT capture *which tables are queried by the BOS* in real time. That visibility comes naturally during Phases 2–6 (refactor → tRPC routers → typed Drizzle schema → the code itself becomes the spec for "what's used"). End-of-program crystallized schema is the synthesis.

## 11. Out of scope (deferred)

- **End-of-program prod cutover** — apply migration script to prod, drop deprecated tables, retire local clone in favor of test Supabase + prod. Triggered by Phase 6 completion.
- **Phases 2–7** — Next.js scaffolding, app migrations, portal MVP, BOS port, CGC seed (per parent spec).
- **Auto-merge agent governance** — pause/repoint Bug Scout, Feature Builder before Phase 6 (program-level TODO).
- **Stale branch cleanup** — `claude/romantic-maxwell`, `fix/remove-external-service-ci`, `founder-ideas`, `hero-update` (separate hygiene work).
- **Tests / TypeScript / CI on money handlers** — incremental per phase that touches the relevant code.
- **Resend / R2 / DO droplet bus-factor migration** — owner is the founder's personal Google account; migration to a business workspace is its own work track.

## 12. Success criteria for Phase 1

Phase 1 succeeds when:

1. The codebase contains only AWKN code (admin BOS, public marketing surfaces, infrastructure for those).
2. A local Supabase clone of prod runs on the dev machine and the BOS works against it.
3. Production database has not been written to during Phase 1 (audit log proves it).
4. A migration script that would clean up prod's residue exists, has been rehearsed locally, and is committed but unapplied.
5. Project docs accurately reflect the post-purge state.
6. Phase 2 (Next.js monorepo scaffold) has no Alpaca residue to dodge.
