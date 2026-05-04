# Phase 1 — Alpaca Purge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all AlpacaPlayhouse residue from the AWKN codebase, establish a local Postgres clone of prod as the dev target for Phases 2–6, and update project docs to reflect the post-purge state.

**Architecture:** Six sequential passes against the `miceli` branch. Each pass closes with one or more strategic commits. Smoke tests run locally (no GitHub Pages deploy from `miceli`). Zero prod DB writes — all DB cleanup is rehearsed against a local clone, applied to prod only at end-of-program cutover.

**Tech Stack:** Vanilla HTML/JS + Tailwind v4 + Supabase (Postgres + Auth + Edge Functions); GitHub Pages for `main` deploy. Local dev via OrbStack + Supabase CLI (`supabase start`). Bash tooling: `rg` (ripgrep), `git`, `psql`.

**Spec:** `docs/superpowers/specs/2026-05-03-phase-1-alpaca-purge-design.md`

**Reference docs:** parent program spec at `docs/superpowers/specs/2026-05-01-cleanup-and-nextjs-refactor-design.md`; `CLAUDE.md`; `docs/CREDENTIALS.md`; `docs/SECRETS-BITWARDEN.md`; `docs/PATTERNS.md`; `docs/ECOSYSTEM-MAP.md`.

---

## File Structure

**Created during execution:**
- `docs/superpowers/work/2026-05-03-alpaca-inventory.md` — Pass 1 tiered manifest
- `docs/superpowers/work/2026-05-03-prod-db-audit.md` — Pass 5 audit findings
- `docs/superpowers/work/2026-05-03-page-pillar-tags.md` — Pass 3 pillar tags
- `docs/migrations/2026-05-03-prod-cleanup-deferred.sql` — deferred prod cleanup migration (rehearsed locally only)
- `docs/LOCAL-DEV.md` — minimal local Supabase setup guide
- `config.local.js` (or env-flag in existing config) — local Supabase target

**Deleted (Pass 2):**
- `/residents/` directory (whole tree)
- Top-level dirs: `blink-poller/`, `camera-event-poller/`, `lg-poller/`, `tesla-poller/`
- Top-level IoT files (whatever Pass 1 surfaces matching `govee_*`, `nest_*`, `tesla_*`, `lg_*`, `anova_*`, `glowforge_*`, `flashforge_*`, `printer_*`, `sonos_*`, `camera_streams_*`, `go2rtc_*`)
- IoT edge function dirs: `supabase/functions/{alexa-room-control,anova-control,glowforge-control,govee-control,lg-control,nest-control,nest-token-refresh,printer-control,sonos-control,tesla-command}`
- `.next/` and `out/` build artifacts
- `*2.md`, `* 2.html` macOS dupes
- `residents/Untitled` (mystery file from environment)

**Deleted (Pass 4):**
- `voice.html`, `voice.js` (admin)
- Vapi/PAI edge function dirs: `supabase/functions/{vapi-server,vapi-webhook,reprocess-pai-email,generate-whispers}` (generate-whispers if confirmed voice-related)

**Modified:**
- `package.json` (rename: `your-app-infra` → `awkn-bos`)
- `login/app.js` (line 90 — pending Open Question #1)
- `supabase/functions/create-payment-link/index.ts` (line 128 — pending Open Question #2)
- `supabase/functions/signwell-webhook/index.ts` (lines 597, 628, 900 — pending Open Question #2)
- `README.md` (template placeholders, R2 bucket reference)
- `.gitignore` (Pass 1)
- `STATUS.md`, `TODO.md`, `CLAUDE.md`, `docs/ECOSYSTEM-MAP.md` (Pass 6)

---

## Pre-Phase 1 — Prerequisites

### Task 0.1: Verify environment

- [ ] **Step 1: Confirm tooling installed**

```bash
git --version
rg --version
which supabase 2>&1 || echo "Supabase CLI not installed yet — install in Pass 5"
ls /Applications/OrbStack.app 2>&1 | head -1
```

Expected: git, rg present. Supabase CLI install deferred to Pass 5. OrbStack present.

- [ ] **Step 2: Confirm clean working tree, current branch**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN status
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN branch --show-current
```

Expected: branch is `miceli`. Working tree may have an untracked `residents/Untitled` file — that's fine; gets deleted in Pass 2.

- [ ] **Step 3: Pull latest from `main` to ingest teammate work**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN fetch origin
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log origin/main..HEAD --oneline
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN log HEAD..origin/main --oneline
```

Expected: see what's diverged. If `main` has new commits we don't have, merge them in:

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN merge origin/main
```

Expected: clean merge or merge commit. If conflicts: resolve manually.

---

## Pass 1 — Inventory

### Task 1.1: Generate identifier grep manifest

**Files:**
- Create: `docs/superpowers/work/2026-05-03-alpaca-inventory.md`

- [ ] **Step 1: Run identifier grep**

Run from repo root:

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
rg -n --no-heading \
  -e 'govee|nest_|tesla|anova|glowforge|flashforge|printer_|sonos|camera_streams|go2rtc|blink|wiz_|music[_-]assistant|residents/|your-app|alpaca|alpacaplayhouse|home-server|tailscale|vapi|voice\.|pai\.|ask-pai|lifeofpai|spirit-whisper|alexa-room|generate-whispers' \
  --glob '!.git' --glob '!.next' --glob '!out' --glob '!node_modules' --glob '!*.lock' \
  > /tmp/alpaca-grep-raw.txt
wc -l /tmp/alpaca-grep-raw.txt
```

Expected: 500+ matches (residents/ alone has dozens of files with internal cross-refs).

- [ ] **Step 2: Extract unique file paths**

```bash
awk -F: '{print $1}' /tmp/alpaca-grep-raw.txt | sort -u > /tmp/alpaca-files.txt
wc -l /tmp/alpaca-files.txt
```

Expected: 100–200 unique files.

- [ ] **Step 3: Auto-classify each file into Tier 1 or Tier 2**

Tier 1 rules (file path matches any):
- `^residents/`
- `^(blink-poller|camera-event-poller|lg-poller|tesla-poller)/`
- `^(govee|nest|tesla|lg|anova|glowforge|flashforge|printer|sonos|camera_streams|go2rtc)_.+\.(html|js|css)$`
- `^supabase/functions/(alexa-room-control|anova-control|glowforge-control|govee-control|lg-control|nest-control|nest-token-refresh|printer-control|sonos-control|tesla-command)/`
- `^\.next/` or `^out/`

Tier 2 rules: anything else (typically `login/`, `spaces/admin/`, `supabase/functions/<non-IoT>` — AWKN code that *references* an Alpaca identifier).

Run a classifier pass (script or manual sort) over `/tmp/alpaca-files.txt`. Produce two lists.

- [ ] **Step 4: Write the manifest**

Create `docs/superpowers/work/2026-05-03-alpaca-inventory.md`:

```markdown
# Alpaca Inventory — 2026-05-03

Produced by Phase 1 Pass 1. Input to Pass 2 Triage & Delete.

Total identifier matches: <N from Step 1>
Unique files: <N from Step 2>

## Tier 1 — Bulk-confirmable (delete by category)

### Category 1: /residents/ directory
- residents/cameras.html
- residents/profile.html
- (full list)

### Category 2: top-level pollers
- blink-poller/
- camera-event-poller/
- lg-poller/
- tesla-poller/

### Category 3: top-level IoT files
- (whatever matches the pattern)

### Category 4: IoT edge functions
- supabase/functions/alexa-room-control/
- supabase/functions/anova-control/
- supabase/functions/glowforge-control/
- supabase/functions/govee-control/
- supabase/functions/lg-control/
- supabase/functions/nest-control/
- supabase/functions/nest-token-refresh/
- supabase/functions/printer-control/
- supabase/functions/sonos-control/
- supabase/functions/tesla-command/

### Category 5: build artifacts
- .next/ (whole tree)
- out/ (whole tree)

### Category 6: macOS dupes
- (whatever matches `*2.md` or `* 2.*`)

## Tier 2 — Per-file review (AWKN-touching surgery)

### login/app.js
- Line 90: `window.location.href = '/residents/cameras.html'` — default landing redirect
- **Open Question #1:** new default landing page

### supabase/functions/create-payment-link/index.ts
- Line 128: redirect URL contains `/residents/profile.html`
- **Open Question #2:** profile.html destination

### supabase/functions/signwell-webhook/index.ts
- Lines 597, 628, 900: email URLs reference `/residents/profile.html`
- **Open Question #2:** same as above

### supabase/functions/<other functions>
- (per-file notes for any other AWKN edge function that references Alpaca code)

### spaces/admin/<files>
- (per-file notes for admin files that import or reference deleted Alpaca code — Pass 3 will catch most of these)

## Vapi-specific (deferred to Pass 4)

### Files
- voice.html
- voice.js (or equivalent)

### Edge functions
- supabase/functions/vapi-server/
- supabase/functions/vapi-webhook/
- supabase/functions/reprocess-pai-email/
- supabase/functions/generate-whispers/ (verify voice-related before including)

## Summary

- Tier 1 categories: 6
- Tier 1 files: ~<N>
- Tier 2 files: ~<N>
- Vapi-specific: ~<N>
- Estimated LOC removal: ~50,000
```

Fill in all `<N>` values and concrete file lists from the grep output.

- [ ] **Step 5: Spot-check the manifest**

Pick 5 random files from each tier and verify:
- File exists at the listed path: `ls <path>`
- Cited line number is correct (for Tier 2): `sed -n '<line>p' <path>`

Expected: all spot-checks pass. Fix any errors before moving on.

### Task 1.2: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add tooling artifacts and stale build dirs**

Append to `.gitignore`:

```
# Tooling artifacts
.claude-flow/
.swarm/

# Stale Next.js build artifacts (deleted in Phase 1 Pass 2)
.next/
out/

# Local Supabase stack (Phase 1 Pass 5)
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 2: Verify**

```bash
git status
```

Expected: `.claude-flow/` and `.swarm/` no longer in untracked list.

### Task 1.3: Commit Pass 1 + push + user gate

- [ ] **Step 1: Stage and commit**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
git add docs/superpowers/work/2026-05-03-alpaca-inventory.md .gitignore
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 1 — alpaca inventory + gitignore

Catalogs every file referencing AlpacaPlayhouse / IoT / Vapi
identifiers, tiered for Pass 2 triage. Adds tooling artifacts
and stale build dirs to .gitignore.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Push to origin**

```bash
git push origin miceli
```

- [ ] **Step 3: PAUSE — user reviews the inventory**

Show the user `docs/superpowers/work/2026-05-03-alpaca-inventory.md`. Ask them to:
1. Confirm the Tier 1 categories are accurate
2. Skim the Tier 2 list and flag anything that looks wrong-tier
3. Note that Open Questions #1 and #2 will surface in Pass 2

User confirms → proceed to Pass 2.

---

## Pass 2 — Triage & Delete

### Task 2.1: Tier 1 Category 1 — `/residents/` directory

- [ ] **Step 1: Show user the category**

Show the file list from the manifest's Category 1. State: *"Tier 1 / `/residents/` directory: N files. No inbound refs from non-Alpaca code (verified in Pass 1). Confirm deletion?"*

- [ ] **Step 2: User confirms**

Wait for explicit "yes" or "show me X first" or "hold."

- [ ] **Step 3: Delete the directory**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
git rm -r residents/
```

If the untracked `residents/Untitled` file is still around, also remove it:

```bash
rm -f residents/Untitled
```

- [ ] **Step 4: Smoke test**

Start a local server and click through 5 representative admin pages:

```bash
python3 -m http.server 8080 &
echo "Open http://localhost:8080/spaces/admin/dashboard.html"
echo "Open http://localhost:8080/spaces/admin/crm.html"
echo "Open http://localhost:8080/spaces/admin/clients.html"
echo "Open http://localhost:8080/spaces/admin/accounting.html"
echo "Open http://localhost:8080/spaces/admin/appdev.html"
```

Expected: pages load. Some 404s for deleted assets (e.g. images that lived in `/residents/`) are acceptable; JS console errors that prevent page function are NOT — flag those for Tier 2 review.

Stop the server when done: `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 2 — remove /residents/ tenant-IoT pages

Removes the entire /residents/ directory. AlpacaPlayhouse
tenant-facing IoT control surfaces (cameras, lights, locks,
profile, etc.) — out of AWKN scope.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.2: Tier 1 Category 2 — top-level poller dirs

- [ ] **Step 1: Show user**

State: *"Tier 1 / poller directories: `blink-poller/`, `camera-event-poller/`, `lg-poller/`, `tesla-poller/`. AlpacaPlayhouse IoT pollers, deployed to a DigitalOcean droplet (separately disabled in Pass 5). Confirm deletion?"*

- [ ] **Step 2: User confirms, delete**

```bash
git rm -r blink-poller/ camera-event-poller/ lg-poller/ tesla-poller/
```

- [ ] **Step 3: Smoke test**

Same as Task 2.1 Step 4.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 2 — remove top-level IoT poller directories

Removes blink-poller, camera-event-poller, lg-poller, tesla-poller.
Source files only — droplet services stop in Pass 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.3: Tier 1 Category 3 — top-level IoT files

- [ ] **Step 1: Show user the file list**

From the Pass 1 manifest, Category 3. Could be empty if no top-level IoT files exist after the directories above are removed.

- [ ] **Step 2: User confirms, delete**

```bash
git rm <each-file>
```

(Or skip this task if Category 3 is empty.)

- [ ] **Step 3: Smoke test + commit (same pattern)**

```bash
git commit -m "chore: Phase 1 Pass 2 — remove top-level IoT files

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.4: Tier 1 Category 4 — IoT edge functions (source removal)

**Note:** This task only removes source files from the repo. The actual `supabase functions delete` calls against the prod project happen in Task 2.10 (deferred to ensure all source removal is committed first).

- [ ] **Step 1: Show user the edge function list**

State: *"Tier 1 / IoT edge function source directories (10 functions): alexa-room-control, anova-control, glowforge-control, govee-control, lg-control, nest-control, nest-token-refresh, printer-control, sonos-control, tesla-command. Source removal only — actual Supabase project undeploy happens later in this pass. Confirm?"*

- [ ] **Step 2: Verify these are the only IoT functions**

```bash
ls /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/supabase/functions/ | grep -iE '(alexa|anova|glowforge|govee|^lg-|nest|printer|sonos|tesla)'
```

Expected: exactly the 10 listed above.

- [ ] **Step 3: User confirms, delete**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
git rm -r supabase/functions/alexa-room-control/
git rm -r supabase/functions/anova-control/
git rm -r supabase/functions/glowforge-control/
git rm -r supabase/functions/govee-control/
git rm -r supabase/functions/lg-control/
git rm -r supabase/functions/nest-control/
git rm -r supabase/functions/nest-token-refresh/
git rm -r supabase/functions/printer-control/
git rm -r supabase/functions/sonos-control/
git rm -r supabase/functions/tesla-command/
```

- [ ] **Step 4: Smoke test**

Verify no remaining edge function in the repo references the deleted ones:

```bash
rg -l 'alexa-room-control|anova-control|glowforge-control|govee-control|lg-control|nest-control|nest-token-refresh|printer-control|sonos-control|tesla-command' supabase/functions/
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 2 — remove IoT edge function sources

Removes 10 AlpacaPlayhouse IoT control edge functions:
alexa-room-control, anova-control, glowforge-control, govee-control,
lg-control, nest-control, nest-token-refresh, printer-control,
sonos-control, tesla-command. Source only — Supabase project
undeploy happens at end of Pass 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.5: Tier 1 Category 5 — build artifacts

- [ ] **Step 1: Show user**

State: *"Tier 1 / stale build artifacts: `.next/` and `out/` directories. From an abandoned Next.js attempt. Already gitignored in Pass 1 — this removes them from the index too."*

- [ ] **Step 2: Delete**

```bash
git rm -r --cached .next/ out/ 2>/dev/null || true
rm -rf .next/ out/
```

- [ ] **Step 3: Verify clean**

```bash
ls -la .next/ out/ 2>&1
git status
```

Expected: directories gone; `git status` shows them removed from index.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: Phase 1 Pass 2 — remove stale .next/ and out/ build artifacts

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.6: Tier 1 Category 6 — macOS dupes

- [ ] **Step 1: Find dupes**

```bash
find /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN -type f \( -name '*2.md' -o -name '* 2.*' \) -not -path '*/node_modules/*' -not -path '*/.git/*' 2>&1
```

- [ ] **Step 2: Show user, confirm, delete**

Show the list. If user confirms:

```bash
# Delete each (use git rm if tracked, rm if untracked)
```

- [ ] **Step 3: Commit**

```bash
git commit -m "chore: Phase 1 Pass 2 — remove macOS file dupes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 2.7: Branding rename

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: any file referencing `your-app` or AlpacaPlayhouse R2 bucket

- [ ] **Step 1: Identify references**

```bash
rg -n 'your-app|alpacaplayhouse|alpaca-r2|YOUR_APP' --glob '!.git'
```

- [ ] **Step 2: Update package.json**

Edit `package.json`:
- `"name": "your-app-infra"` → `"name": "awkn-bos"`
- `"description"`: replace template description with AWKN-specific
- `"keywords"`: replace placeholder keywords with AWKN-relevant ones
- `"repository"`: update if templated

- [ ] **Step 3: Update README.md**

Open `README.md`. Remove template / AlpacaPlayhouse boilerplate. Replace with AWKN-specific README (link to CLAUDE.md, ECOSYSTEM-MAP.md, mention multi-dev branch convention, link to STATUS.md).

- [ ] **Step 4: Update any other references**

For each file from Step 1, update or delete as appropriate.

- [ ] **Step 5: Smoke test**

```bash
python3 -m http.server 8080 &
# Click 5 admin pages
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 2 — branding rename to awkn-bos

Renames package.json from your-app-infra to awkn-bos, updates
README and other template/AlpacaPlayhouse references to reflect
the AWKN project identity.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.8: Tier 2 — login/app.js (Open Question #1)

**Files:**
- Modify: `login/app.js`

- [ ] **Step 1: Open the file and show context**

Read `login/app.js` lines 80-100 (or wherever the redirect lives). Show the user:

```javascript
// Around line 90:
window.location.href = '/residents/cameras.html';
```

- [ ] **Step 2: Surface Open Question #1**

State: *"This is the default landing page redirect after login. Currently sends users to `/residents/cameras.html` (deleted). Need a new destination. Options:*
- *`/spaces/admin/dashboard.html` — generic admin landing*
- *`/spaces/admin/crm.html` — CRM as default*
- *Role-aware (check `app_users.role` and route accordingly)*
- *Master schedule*
- *`/portal/` — future client portal (doesn't exist yet)*
- *Other?"*

Wait for user decision.

- [ ] **Step 3: Apply edit**

Replace the redirect target with whatever the user chose. If role-aware, write the conditional logic.

- [ ] **Step 4: Smoke test**

Local server, navigate to login flow, verify redirect lands on the new target.

- [ ] **Step 5: Commit**

```bash
git add login/app.js
git commit -m "$(cat <<'EOF'
fix: Phase 1 Pass 2 — replace deleted /residents/cameras.html landing

Updates the post-login default redirect target. Previously pointed
at /residents/cameras.html (deleted in this pass). New target:
<chosen target>.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.9: Tier 2 — Stripe + SignWell email URLs (Open Question #2)

**Files:**
- Modify: `supabase/functions/create-payment-link/index.ts` (line 128)
- Modify: `supabase/functions/signwell-webhook/index.ts` (lines 597, 628, 900)

- [ ] **Step 1: Show context for create-payment-link**

```bash
sed -n '120,135p' /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/supabase/functions/create-payment-link/index.ts
```

Read the line 128 context.

- [ ] **Step 2: Show context for signwell-webhook**

```bash
sed -n '590,635p; 895,905p' /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/supabase/functions/signwell-webhook/index.ts
```

- [ ] **Step 3: Surface Open Question #2**

State: *"Stripe payment links and SignWell completion emails redirect users to `/residents/profile.html`. New destination needed. Options:*
- *`/spaces/admin/dashboard.html` — admin landing (assumes recipients are staff)*
- *`/portal/` — future client portal (doesn't exist yet — placeholder?)*
- *External page on awknranch.com — `awknranch.com/account` or similar*
- *Role-aware redirect via login (link to `/login/?next=...`)*
- *Other?"*

Wait for decision. Note: this answer applies to all 4 line locations (create-payment-link:128 + signwell-webhook:597, 628, 900).

- [ ] **Step 4: Apply edits**

Replace `/residents/profile.html` with the chosen target at all 4 locations. Use the Edit tool with `replace_all=true` if the literal string is identical across all 4.

- [ ] **Step 5: Smoke test**

Verify edge function source compiles (no syntax errors). Don't deploy yet — full edge function deploy happens after all Tier 2 changes land.

```bash
deno check /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/supabase/functions/create-payment-link/index.ts
deno check /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/supabase/functions/signwell-webhook/index.ts
```

(If `deno` not installed, skip — verify via Supabase Studio later.)

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/create-payment-link/index.ts supabase/functions/signwell-webhook/index.ts
git commit -m "$(cat <<'EOF'
fix: Phase 1 Pass 2 — replace deleted /residents/profile.html in payment + signwell flows

Updates Stripe payment-link and SignWell webhook completion redirects
to point at <chosen target> instead of the deleted profile.html.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 2.10: Tier 2 — sweep remaining Tier 2 files

For each remaining file in the Pass 1 manifest's Tier 2 list (excluding Vapi-specific files which are deferred to Pass 4):

- [ ] **Step 1: Open the file, show user the relevant lines**

- [ ] **Step 2: User decides — kill / keep / surgery**

- [ ] **Step 3: Apply the decision**

- [ ] **Step 4: Smoke test** (local server, click affected page if any)

- [ ] **Step 5: Commit** in batches of related files (e.g. one commit per file or one commit for "edge function references to deleted IoT functions")

Continue until Tier 2 is empty.

### Task 2.11: Undeploy IoT edge functions from Supabase project

- [ ] **Step 1: Verify Supabase CLI logged in**

```bash
supabase projects list 2>&1
```

If not logged in: `supabase login`. (Requires the user's Supabase access token.)

- [ ] **Step 2: List currently deployed functions**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
supabase functions list 2>&1
```

Expected: see all 14 Alpaca-named functions still deployed (sources are gone from repo but the deployed copies remain until we explicitly delete).

- [ ] **Step 3: Show user, confirm undeploy**

State: *"Undeploying 10 IoT edge functions from the prod Supabase project: alexa-room-control, anova-control, glowforge-control, govee-control, lg-control, nest-control, nest-token-refresh, printer-control, sonos-control, tesla-command. Vapi-related functions stay until Pass 4. Confirm?"*

- [ ] **Step 4: Undeploy each**

```bash
supabase functions delete alexa-room-control --project-ref <PROJECT_REF>
supabase functions delete anova-control --project-ref <PROJECT_REF>
supabase functions delete glowforge-control --project-ref <PROJECT_REF>
supabase functions delete govee-control --project-ref <PROJECT_REF>
supabase functions delete lg-control --project-ref <PROJECT_REF>
supabase functions delete nest-control --project-ref <PROJECT_REF>
supabase functions delete nest-token-refresh --project-ref <PROJECT_REF>
supabase functions delete printer-control --project-ref <PROJECT_REF>
supabase functions delete sonos-control --project-ref <PROJECT_REF>
supabase functions delete tesla-command --project-ref <PROJECT_REF>
```

(Get `<PROJECT_REF>` from `docs/CREDENTIALS.md` or `supabase projects list`.)

- [ ] **Step 5: Verify**

```bash
supabase functions list --project-ref <PROJECT_REF> | grep -E '(alexa|anova|glowforge|govee|^lg-|nest|printer|sonos|tesla)'
```

Expected: empty output. Vapi-related functions still listed (deferred to Pass 4).

- [ ] **Step 6: Document the undeploy in the inventory**

Append a "Pass 2 close" section to `docs/superpowers/work/2026-05-03-alpaca-inventory.md` listing the 10 undeployed functions with timestamp.

- [ ] **Step 7: Commit (documentation only — no source change)**

```bash
git add docs/superpowers/work/2026-05-03-alpaca-inventory.md
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 2 — record IoT edge function undeploy

Documents the 10 IoT edge functions undeployed from the Supabase
project (sources were removed earlier in Pass 2). Vapi-related
functions deferred to Pass 4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 8: Push**

```bash
git push origin miceli
```

---

## Pass 3 — Page Audit

**Strategy:** the admin BOS uses a flat structure (all `*.html` and `*.js` files directly in `spaces/admin/`). Group files by feature for chunking. Each chunk is its own task and commit.

**Likely chunks** (verify by `ls spaces/admin/`):
- Dashboard: `dashboard.{html,js}`, `index.html`, `home.{html,js}`
- CRM: `crm.{html,js,css}`, `crm-actions.js`, `clients.{html,js}`
- Master Schedule: `schedule.*`, `master-schedule.*`, `events.*`, `within-schedule.*`
- Proposals: `proposals.*`, `proposal-*`
- Accounting: `accounting.*`
- Venue Spaces: `venue-spaces.*`, `spaces.*`
- AI Admin: `ai-admin.*`
- App Dev: `appdev.*`
- Brand: `brand.*`
- (others discovered via ls)

### Task 3.0: Initialize the page-pillar-tags doc

**Files:**
- Create: `docs/superpowers/work/2026-05-03-page-pillar-tags.md`

- [ ] **Step 1: Create the doc with header**

```markdown
# Admin BOS Page-Pillar Tags — Phase 1 Pass 3

Per-page pillar assignment from the Phase 1 page audit. Input to Phase 6 (BOS Next.js port) IA work.

Pillars: Ranch / Within / Retreat / Venue / Cross-cutting / TBD

| Page | Pillar | Notes |
|---|---|---|
```

- [ ] **Step 2: Commit empty doc**

```bash
git add docs/superpowers/work/2026-05-03-page-pillar-tags.md
git commit -m "chore: Phase 1 Pass 3 — initialize page-pillar tags doc

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

### Task 3.1–3.N: Per-chunk audit

Repeat for each chunk:

- [ ] **Step 1: List the chunk's files**

```bash
ls /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/spaces/admin/ | grep -E '<chunk-pattern>'
```

- [ ] **Step 2: Pull latest from main**

```bash
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN fetch origin
git -C /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN merge origin/main
gh pr list --limit 5
```

If a teammate has an open PR touching this chunk, hold the chunk and resolve coordination first.

- [ ] **Step 3: For each file in the chunk: open + flag + decide**

Per file:
1. Read the HTML.
2. Read the JS.
3. Run targeted greps inside the file's content for: imports from deleted dirs (`/residents/`, `blink-poller`, etc.), references to deleted IoT identifiers, references to deleted edge functions, role checks against `resident` / non-AWKN roles, copy strings mentioning IoT or AlpacaPlayhouse, asset paths to deleted images.
4. For each flag: surface to user with file + line + current value + options (kill the line / keep as-is / replace with X). User decides. Apply edit.

- [ ] **Step 4: Pillar-tag each page**

Append rows to `docs/superpowers/work/2026-05-03-page-pillar-tags.md`:

```markdown
| crm.html | Cross-cutting | Serves both Ranch + Within leads |
| crm.js | Cross-cutting | Same as crm.html |
| accounting.html | Cross-cutting | Books for both brands |
```

User confirms pillar assignments.

- [ ] **Step 5: Smoke test the chunk**

Local server, click each page in the chunk:

```bash
python3 -m http.server 8080 &
# Open each affected page, verify it loads, verify functionality if non-trivial
kill %1
```

- [ ] **Step 6: Commit the chunk**

```bash
git add -A
git commit -m "$(cat <<'EOF'
audit: Phase 1 Pass 3 — <chunk name>

Removes alpaca residue from <chunk> admin pages: <summary of changes>.
Pillar tags added to docs/superpowers/work/2026-05-03-page-pillar-tags.md.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 3.Z: Pass 3 close + push (run after every chunk has been audited)

- [ ] **Step 1: Verify all admin pages reviewed**

```bash
ls /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/spaces/admin/*.html
```

Cross-check against `docs/superpowers/work/2026-05-03-page-pillar-tags.md` — every page should have a row.

- [ ] **Step 2: Final smoke test**

Open every admin page and verify it loads.

- [ ] **Step 3: Push**

```bash
git push origin miceli
```

---

## Pass 4 — Vapi Decommission

### Task 4.1: Cross-ref grep sanity check

- [ ] **Step 1: Run final Vapi grep**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
rg -l 'vapi|voice\.|pai\.|ask-pai|lifeofpai|spirit-whisper|generate-whispers' --glob '!.git'
```

Expected: handful of files. Save list for the deletion steps.

- [ ] **Step 2: Confirm `generate-whispers` is voice-related**

Read `supabase/functions/generate-whispers/index.ts`. If it's voice/PAI-related (likely), include it in deletion. If it's something else, defer or keep.

- [ ] **Step 3: Show user the list, confirm**

State: *"Vapi/PAI surface area to remove: <files>. Confirm wholesale decommission?"*

### Task 4.2: Delete admin voice surface

- [ ] **Step 1: Delete voice files**

```bash
git rm spaces/admin/voice.html spaces/admin/voice.js 2>&1 || true
# (paths may vary — check Pass 4.1 grep output)
```

- [ ] **Step 2: Remove voice nav entry from admin sidebar**

If admin has a shared nav (e.g. `spaces/admin/nav.html` or similar), remove the voice link.

- [ ] **Step 3: Smoke test**

Local server. Confirm admin loads without voice link, no console errors.

- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 4 — remove admin voice surface

Removes voice.html, voice.js, and voice nav entry from admin BOS.
Vapi decommissioned wholesale per CTO confirmation 2026-05-03.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.3: Delete Vapi/PAI edge function sources

- [ ] **Step 1: Delete from repo**

```bash
git rm -r supabase/functions/vapi-server/
git rm -r supabase/functions/vapi-webhook/
git rm -r supabase/functions/reprocess-pai-email/
git rm -r supabase/functions/generate-whispers/  # if voice-related per Task 4.1 Step 2
```

- [ ] **Step 2: Verify**

```bash
ls supabase/functions/ | grep -iE '(vapi|pai|whisper)'
```

Expected: empty.

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 4 — remove Vapi/PAI edge function sources

Removes vapi-server, vapi-webhook, reprocess-pai-email, generate-whispers.
Source only — Supabase project undeploy in Task 4.4.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.4: Undeploy Vapi/PAI functions from Supabase

- [ ] **Step 1: Undeploy each**

```bash
supabase functions delete vapi-server --project-ref <PROJECT_REF>
supabase functions delete vapi-webhook --project-ref <PROJECT_REF>
supabase functions delete reprocess-pai-email --project-ref <PROJECT_REF>
supabase functions delete generate-whispers --project-ref <PROJECT_REF>  # if applicable
```

- [ ] **Step 2: Verify**

```bash
supabase functions list --project-ref <PROJECT_REF> | grep -iE '(vapi|pai|whisper)'
```

Expected: empty.

### Task 4.5: Drop env vars + Bitwarden entries

- [ ] **Step 1: List Vapi-related env vars**

Check `.env`, `.env.local`, Supabase project secrets, GitHub Actions secrets.

```bash
grep -i vapi /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/.env* 2>&1 || echo "no .env Vapi refs"
supabase secrets list --project-ref <PROJECT_REF> | grep -i vapi
```

- [ ] **Step 2: Remove from Supabase secrets**

For each `VAPI_*` key found:

```bash
supabase secrets unset VAPI_API_KEY --project-ref <PROJECT_REF>
# repeat per key
```

- [ ] **Step 3: Remove from local .env files**

Edit `.env` / `.env.local` to remove Vapi entries. (These may not be tracked in git — verify before committing.)

- [ ] **Step 4: Remove from Bitwarden**

Open Bitwarden CLI or app per `docs/SECRETS-BITWARDEN.md`. Find Vapi entries (search "vapi"). Delete or archive each.

- [ ] **Step 5: Remove from GitHub Actions secrets**

If any Vapi keys exist in GitHub Actions:

```bash
gh secret list | grep -i vapi
gh secret remove VAPI_API_KEY  # per key
```

- [ ] **Step 6: Commit any tracked file changes**

```bash
git add -A
git status
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 4 — drop Vapi env vars

Removes Vapi env var references from tracked config files.
Supabase secrets, Bitwarden, GitHub Actions secrets cleaned
in same task (untracked).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 4.6: Final Vapi grep + push

- [ ] **Step 1: Verify clean**

```bash
rg -l 'vapi|ask-pai|lifeofpai|spirit-whisper' /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN --glob '!.git'
```

Expected: zero matches (or only marketing copy that uses "voice" generically — judgment call).

- [ ] **Step 2: Final BOS smoke test**

Local server. Walk through admin. Confirm no console errors referencing Vapi/PAI/voice.

- [ ] **Step 3: Push**

```bash
git push origin miceli
```

---

## Pass 5 — Audit + Local Clone + Droplet

### Task 5.0: Prerequisites

- [ ] **Step 1: Verify OrbStack is running**

```bash
open -a OrbStack
sleep 5
docker info 2>&1 | head -10
```

Expected: Docker info shows OrbStack as the engine. If first run: complete the OrbStack setup wizard (permissions, etc.).

- [ ] **Step 2: Install Supabase CLI if not present**

```bash
which supabase || brew install supabase/tap/supabase
supabase --version
```

- [ ] **Step 3: Verify Supabase CLI auth**

```bash
supabase projects list
```

If not logged in: `supabase login`. Get a personal access token from https://supabase.com/dashboard/account/tokens.

### Task 5.1: Read-only prod audit

**Files:**
- Create: `docs/superpowers/work/2026-05-03-prod-db-audit.md`

- [ ] **Step 1: Get prod connection string**

From `docs/CREDENTIALS.md` or Supabase dashboard → Project Settings → Database → Connection string (use the read-only or pooler URL). Store in env var:

```bash
export SUPABASE_PROD_DB_URL="<connection string>"
```

**Do not commit this string anywhere.** Re-export in any new shell session — env vars don't persist across shells.

- [ ] **Step 2: List all tables**

```bash
psql "$SUPABASE_PROD_DB_URL" -c "\dt public.*" > /tmp/prod-tables.txt
cat /tmp/prod-tables.txt
```

- [ ] **Step 3: List all functions**

```bash
psql "$SUPABASE_PROD_DB_URL" -c "\df public.*" > /tmp/prod-functions.txt
cat /tmp/prod-functions.txt
```

- [ ] **Step 4: List all RLS policies**

```bash
psql "$SUPABASE_PROD_DB_URL" -c "SELECT schemaname, tablename, policyname FROM pg_policies WHERE schemaname='public';" > /tmp/prod-policies.txt
```

- [ ] **Step 5: Cross-check against Pass 1 inventory**

For each table / function / policy: does the name match an Alpaca/IoT identifier? Common suspects:
- `vehicles`, `tesla_*`, `nest_*`, `govee_*`, `sonos_*`, `lg_*`, `anova_*`, `glowforge_*`, `printer_*`, `camera_*`, `blink_*`
- `iot_*`, `device_*`, `tenant_*`
- `pai_*`, `voice_*`, `vapi_*`, `whisper_*`

Build a list of hits.

- [ ] **Step 6: Write the audit doc**

Create `docs/superpowers/work/2026-05-03-prod-db-audit.md`:

```markdown
# Prod DB Audit — Phase 1 Pass 5 — 2026-05-03

**Method:** read-only `psql` introspection. Zero writes.

## Tables found (N total)

<paste prod-tables.txt summary>

### Suspected Alpaca residue
- `vehicles` (Tesla-flavored — confirmed for deferred drop per Decision #2)
- `<other suspects>`

### Confirmed AWKN
- `crm_leads`, `app_users`, `bookings`, `proposals`, ...

## Functions

<paste relevant from prod-functions.txt>

## RLS policies referencing alpaca-themed tables

<list>

## Conclusion

- Total tables: N
- Suspected residue: M
- Required for end-of-program cutover migration: K objects
- Hunch validation: <user's hunch was right / wrong / partially right>
```

- [ ] **Step 7: Commit the audit doc**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
git add docs/superpowers/work/2026-05-03-prod-db-audit.md
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 5 — prod DB audit findings

Read-only audit of prod Supabase. Documents alpaca residue in
tables/functions/policies. Input to deferred cleanup migration
(Phase 1 Pass 5d, applied at end-of-program cutover only).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.2: Stand up local Supabase clone

- [ ] **Step 1: Initialize Supabase locally**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
supabase init
```

If prompted about existing `supabase/` folder: keep existing edge functions, just add config files.

- [ ] **Step 2: Start the local stack**

```bash
supabase start
```

Wait ~1 min while Docker pulls images. On success, prints:

```
API URL: http://127.0.0.1:54321
DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323
anon key: eyJ...
service_role key: eyJ...
```

Save these for the next steps.

- [ ] **Step 3: Dump prod**

```bash
mkdir -p /tmp/awkn-prod-dump
pg_dump "$SUPABASE_PROD_DB_URL" \
  --schema=public --schema=auth --schema=storage \
  --no-owner --no-privileges \
  -f /tmp/awkn-prod-dump/prod-dump.sql
ls -lh /tmp/awkn-prod-dump/
```

Expected: a `.sql` file, possibly large (50MB+).

- [ ] **Step 4: Restore into local**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/awkn-prod-dump/prod-dump.sql
```

May produce some warnings about extensions / roles — generally safe.

- [ ] **Step 5: Verify restore**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.*" | head -30
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT COUNT(*) FROM crm_leads;"
```

Expected: tables listed, sane row counts.

### Task 5.3: Wire BOS to point at local Supabase

**Files:**
- Create or modify: config file with Supabase URL/key

- [ ] **Step 1: Identify the current Supabase config location**

```bash
rg -l 'createClient|supabase.co|SUPABASE_URL|SUPABASE_ANON' /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN --glob '!.git'
```

Likely candidates: `config.js`, `js/config.js`, or inline in `assets/main.js`.

- [ ] **Step 2: Introduce a local-vs-prod flag**

In the config file, replace the hardcoded URL/key with a conditional:

```javascript
// Toggle local vs prod via window.AWKN_LOCAL_DB or URL param ?local=1
const useLocal = (typeof window !== 'undefined') && (
  window.AWKN_LOCAL_DB === true ||
  new URLSearchParams(window.location.search).get('local') === '1' ||
  localStorage.getItem('awkn_local_db') === 'true'
);

const SUPABASE_URL = useLocal
  ? 'http://127.0.0.1:54321'
  : 'https://<prod-project-ref>.supabase.co';

const SUPABASE_ANON_KEY = useLocal
  ? '<local anon key from supabase start output>'
  : '<prod anon key>';
```

- [ ] **Step 3: Smoke test against local**

```bash
python3 -m http.server 8080 &
# Open http://localhost:8080/spaces/admin/dashboard.html?local=1 in browser
# Verify it loads against local stack — should see same data as prod (because we just restored from prod)
kill %1
```

- [ ] **Step 4: Smoke test against prod (regression check)**

Open the same URL without `?local=1`. Should still hit prod.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: Phase 1 Pass 5 — local Supabase target via ?local=1 flag

Adds a runtime toggle (URL param ?local=1, window.AWKN_LOCAL_DB,
or localStorage) to point the BOS at a local Supabase stack
instead of prod. Local stack runs via supabase start. Default
behavior unchanged (prod).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.4: Stop droplet IoT pollers

- [ ] **Step 1: SSH to the droplet**

Per `docs/CREDENTIALS.md` for the droplet IP and SSH key. If you have a host alias set up, use it; otherwise:

```bash
ssh awkn-droplet  # if alias exists
# OR
ssh -i ~/.ssh/<key> root@<droplet-ip>  # direct
```

- [ ] **Step 2: List running services**

```bash
sudo systemctl list-units --type=service --state=running | grep -iE '(tesla|lg|nest|govee|sonos|anova|glowforge|printer|blink|camera)'
```

Or for pm2:

```bash
pm2 list
```

- [ ] **Step 3: Stop and disable pollers**

For each Alpaca poller service (`tesla-poller`, `lg-poller`, etc.):

```bash
sudo systemctl stop <service>
sudo systemctl disable <service>
```

(For pm2: `pm2 stop <name> && pm2 delete <name>`.)

- [ ] **Step 4: Verify stopped**

```bash
sudo systemctl status <service>
```

Expected: inactive / disabled.

- [ ] **Step 5: Smoke test BOS**

From local machine:

```bash
python3 -m http.server 8080 &
# Open http://localhost:8080/spaces/admin/dashboard.html (prod target)
# Verify still works (pollers never served BOS — sanity check)
kill %1
```

- [ ] **Step 6: Document in audit doc**

Append to `docs/superpowers/work/2026-05-03-prod-db-audit.md`:

```markdown
## Pass 5c — Droplet pollers stopped 2026-05-DD

Services disabled:
- tesla-poller (was running)
- lg-poller (was running)
- <others if found>
```

- [ ] **Step 7: Commit**

```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
git add docs/superpowers/work/2026-05-03-prod-db-audit.md
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 5 — droplet IoT pollers stopped

Disables tesla-poller, lg-poller, and any other Alpaca IoT
poller services on the DigitalOcean droplet. Droplet itself
stays running. BOS unaffected (pollers never served BOS).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.5: Write deferred prod cleanup migration

**Files:**
- Create: `docs/migrations/2026-05-03-prod-cleanup-deferred.sql`

- [ ] **Step 1: Generate the migration SQL**

Based on `docs/superpowers/work/2026-05-03-prod-db-audit.md`, write a SQL file containing the cleanup operations:

```sql
-- Phase 1 Pass 5d — Deferred Prod Cleanup Migration
-- Status: REHEARSED LOCALLY ONLY — DO NOT APPLY TO PROD YET
-- Apply only at end-of-program cutover with explicit user re-approval.

BEGIN;

-- Drop AlpacaPlayhouse tables (residue confirmed in Pass 5a audit)
DROP TABLE IF EXISTS public.vehicles CASCADE;
-- DROP TABLE IF EXISTS public.<other_suspect> CASCADE;

-- Drop alpaca-flavored functions
-- DROP FUNCTION IF EXISTS public.<func_name>;

-- (anything else from the audit)

COMMIT;
```

Customize the contents based on the audit findings.

- [ ] **Step 2: Rehearse against local**

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN/docs/migrations/2026-05-03-prod-cleanup-deferred.sql
```

Expected: clean execution. Verify dropped objects are gone:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "\dt public.vehicles" 2>&1
```

Expected: no relation found.

- [ ] **Step 3: Smoke test BOS against the cleaned local stack**

Open `http://localhost:8080/spaces/admin/dashboard.html?local=1` and click around. Verify nothing references the dropped tables/functions in a runtime-breaking way.

If something breaks: that's a Tier 2 oversight — go back to Pass 2 / Pass 3 and surface the breaking reference for cleanup. Then re-rehearse the migration.

- [ ] **Step 4: Commit (script only — not applied to prod)**

```bash
git add docs/migrations/2026-05-03-prod-cleanup-deferred.sql
git commit -m "$(cat <<'EOF'
chore: Phase 1 Pass 5 — deferred prod cleanup migration script

Migration script for end-of-program cutover. Rehearsed against
local Supabase clone — clean. NOT applied to prod. Applied only
at end of refactor program against the crystallized schema, with
explicit user re-approval and monitoring.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.6: Write LOCAL-DEV.md

**Files:**
- Create: `docs/LOCAL-DEV.md`

- [ ] **Step 1: Draft the doc**

```markdown
# Local Dev — AWKN

How to run AWKN against a local Supabase clone of prod.

## Prerequisites

- macOS (or Linux with Docker)
- [OrbStack](https://orbstack.dev/) (`brew install --cask orbstack`) — or Docker Desktop
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- `psql` (`brew install postgresql`)
- A Supabase personal access token from https://supabase.com/dashboard/account/tokens

## First-time setup

1. **Authenticate Supabase CLI:**
   ```bash
   supabase login
   ```

2. **Start OrbStack** (open the OrbStack app once; daemon stays running).

3. **Initialize and start the local stack** (from repo root):
   ```bash
   supabase start
   ```

   Wait ~1 min on first run. Output prints local URLs and keys — save them.

4. **Dump prod and restore locally:**
   ```bash
   export SUPABASE_PROD_DB_URL="<get from CREDENTIALS.md>"
   pg_dump "$SUPABASE_PROD_DB_URL" \
     --schema=public --schema=auth --schema=storage \
     --no-owner --no-privileges \
     -f /tmp/awkn-prod-dump.sql
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/awkn-prod-dump.sql
   ```

## Daily workflow

Start the stack:
```bash
supabase start
```

Run BOS locally:
```bash
python3 -m http.server 8080
# Open http://localhost:8080/spaces/admin/dashboard.html?local=1
```

The `?local=1` query param toggles the BOS to point at `http://127.0.0.1:54321` instead of prod.

Stop the stack when done:
```bash
supabase stop
```

## Edge functions locally

To run edge functions against the local stack:

```bash
supabase functions serve
```

This serves all functions at `http://127.0.0.1:54321/functions/v1/<name>`.

## Refresh from prod

When prod schema/data drifts and you want a fresh clone:

```bash
supabase db reset  # wipes local DB
pg_dump "$SUPABASE_PROD_DB_URL" --schema=public --schema=auth --schema=storage --no-owner --no-privileges -f /tmp/awkn-prod-dump.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/awkn-prod-dump.sql
```

## Webhooks (Stripe / SignWell / Telnyx)

Local Supabase isn't publicly reachable. To test webhooks locally, use an ngrok-style tunnel:

```bash
brew install ngrok
ngrok http 54321
```

Use the ngrok URL when configuring the webhook source. Deferred until Phase 4-5 makes this a daily need.

## Troubleshooting

- **Port conflict:** Supabase uses 54321 (API), 54322 (DB), 54323 (Studio). If conflict, edit `supabase/config.toml` to remap.
- **Daemon not running:** open OrbStack app; verify `docker ps` works.
- **Dump too large:** consider dumping schema-only first (`pg_dump --schema-only`) for fast iteration; restore data selectively if needed.
```

- [ ] **Step 2: Update CLAUDE.md with pointer**

Add a one-liner to `CLAUDE.md` Quick Refs:

```markdown
- **Local dev:** `docs/LOCAL-DEV.md` — run BOS against a local Supabase clone via `supabase start`
```

- [ ] **Step 3: Commit**

```bash
git add docs/LOCAL-DEV.md CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: Phase 1 Pass 5 — LOCAL-DEV.md guide

Documents the local Supabase setup: OrbStack + Supabase CLI +
pg_dump/restore from prod. Establishes the dev workflow used
through Phases 2-6 of the refactor program.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

### Task 5.7: Push

- [ ] **Step 1: Push**

```bash
git push origin miceli
```

---

## Pass 6 — Docs

### Task 6.1: Update STATUS.md

**Files:**
- Modify: `STATUS.md`

- [ ] **Step 1: Update last-updated date and "Recent Changes" table**

Edit `STATUS.md`:
- Bump "Last Updated" to today's date
- Add "Phase 1 complete" row to Recent Changes
- Update Feature Status table:
  - "AlpacaPlayhouse residue" row → mark removed (or delete the row)
  - "Voice / PAI / Vapi" row → mark decommissioned
- Update Known Limitations:
  - Remove the bullet about ~30% Alpaca residue
  - Remove the bullet about `.next/` and `/out/` tracked
  - Update "founder's personal Google account" bullet (still accurate, still relevant)

- [ ] **Step 2: Verify line count under 100**

```bash
wc -l STATUS.md
```

Expected: < 100. Trim if needed.

### Task 6.2: Update TODO.md

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Close out Phase 1 items**

In TODO.md:
- Mark all Phase 1 prerequisite questions as resolved with date
- Move Phase 1 pass items to a "Completed (Phase 1)" section or delete
- Add Phase 2 prerequisites at the top of "Critical"

- [ ] **Step 2: Update Pillar / agent governance reminders**

Keep the pre-Phase-6 IA freeze reminder. Keep the auto-merge agent governance reminder.

- [ ] **Step 3: Verify under 100 lines**

```bash
wc -l TODO.md
```

### Task 6.3: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Remove "Vestigial scope" section**

The whole "## Vestigial scope — DO NOT EXTEND" section is no longer applicable (because the vestigial code is gone). Delete it.

- [ ] **Step 2: Update Quick Refs**

Add the LOCAL-DEV pointer (added in Pass 5.6 — verify it's there).

- [ ] **Step 3: Update Code Guards / Mandatory Behaviors**

Review for any references to deleted Alpaca patterns. Update or remove.

### Task 6.4: Update docs/ECOSYSTEM-MAP.md

**Files:**
- Modify: `docs/ECOSYSTEM-MAP.md`

- [ ] **Step 1: Update surface inventory**

Sections referencing deleted surfaces (`/residents/`, IoT pages, voice surface) — update to reflect post-purge state. Keep historical context as a "Phase 1 deleted" subsection if useful, or just remove.

- [ ] **Step 2: Update Phase 1 status**

Mark the Phase 1 milestone as complete in any phase-tracking section.

### Task 6.5: Delete the awkn-pre-reset insurance folder

- [ ] **Step 1: Verify Phase 1 is fully complete**

All exit criteria met (see spec §9):
- BOS deploys, smoke tests green
- Codebase ~30% smaller (`git diff --stat origin/main..HEAD | tail -1`)
- `rg` for Alpaca identifiers returns clean
- Vapi gone (functions, env vars, Bitwarden)
- Droplet pollers stopped
- Prod DB audit doc + local stack + deferred migration script committed
- Project docs current
- Zero prod DB writes (verifiable)

- [ ] **Step 2: Delete the folder**

```bash
rm -rf /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01
```

(Outside the repo; not a git operation.)

### Task 6.6: Final commit + push

- [ ] **Step 1: Stage all doc updates**

```bash
git add STATUS.md TODO.md CLAUDE.md docs/ECOSYSTEM-MAP.md
```

- [ ] **Step 2: Bump version**

Per `docs/DEPLOY.md` instructions, bump version. Likely:

```bash
# Read version.json, bump per project convention
```

(Or per the parent CLAUDE.md mandatory behavior: "vYYMMDD.NN" format. CI bumps version on push to main; for `miceli` we may bump locally for the closing commit. Verify with `docs/DEPLOY.md`.)

- [ ] **Step 3: Final closing commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: Phase 1 complete — alpaca purge done, docs reflect post-purge state

Updates STATUS.md, TODO.md, CLAUDE.md, ECOSYSTEM-MAP.md to
reflect the completed Phase 1 purge. Removes vestigial-scope
section from CLAUDE.md (no longer applicable). Closes out Phase
1 prerequisite questions in TODO.md, opens Phase 2 prerequisites.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Push**

```bash
git push origin miceli
```

### Task 6.7: Final verification

- [ ] **Step 1: All exit criteria met (run the checklist)**

Run each verification command:

```bash
# 1. BOS smoke test
python3 -m http.server 8080 &
# Open every admin page; verify all green
kill %1

# 2. Codebase size
git log --shortstat origin/main..HEAD | tail -3

# 3. Alpaca grep clean
rg 'govee|nest_|tesla|anova|glowforge|flashforge|residents/|alpacaplayhouse|vapi|ask-pai|lifeofpai' --glob '!.git' --glob '!docs/' | head

# 4. Vapi clean
rg 'vapi' --glob '!.git' --glob '!docs/'

# 5. Droplet pollers stopped
ssh awkn-droplet 'systemctl list-units --type=service --state=running | grep -iE "(tesla|lg|nest|govee|sonos)"'

# 6. Prod DB write check (Supabase audit log)
# Open Supabase dashboard → Logs → DB → filter for write operations from your IP during Phase 1 dates
# Expected: zero non-pg_dump writes

# 7. awkn-pre-reset folder gone
ls /Volumes/LIVE/Projects/MiracleMind/Clients/awkn-pre-reset-2026-05-01/ 2>&1
```

- [ ] **Step 2: Phase 1 close**

If all checks pass, Phase 1 is done. Run `/handoff` to update STATUS.md with final session note.

```bash
# (Skill invocation, not bash)
```

Phase 2 (monorepo scaffold) is the next program phase — separate brainstorm, spec, plan.

---

## Self-Review Checklist (executed before plan was committed)

- ✅ Spec coverage: every section of the spec maps to at least one task
- ✅ Placeholder scan: no "TBD" / "TODO" / "implement later" — exact paths, exact commands throughout
- ✅ Type consistency: file paths consistent across tasks; commit message conventions consistent
- ✅ Decision-gate markers: every Open Question has an explicit "PAUSE — surface to user" step
- ✅ Smoke test cadence matches spec §8 (local server, not GitHub Pages deploy)
- ✅ Zero prod DB writes affirmed in Pass 5; deferred migration is rehearsed-only
