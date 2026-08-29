# AWKN Ranch — Project Directives

## Founder Idea Capture (this clone only)

This clone at `~/Documents/awkn/founder-capture/awkn-ranch` is used exclusively for idea capture. When William says "capture this idea," "log this," "save this thought," or similar:

1. Determine a short title (max 60 chars).
2. Write a new file at `ideas/YYYY-MM-DD-<slug>.md` (today's date, title in kebab-case).
3. Use this frontmatter exactly:
   ```
   ---
   title: <title>
   date: YYYY-MM-DD
   tags: []
   status: raw
   ---
   ```
4. Below frontmatter: write the idea in clear prose. Capture, don't embellish.
5. Reply with: "Captured: <title>" and nothing else.

Rules for this clone:
- Never modify any file outside `ideas/`.
- Never push or commit manually — the local command center auto-syncs.
- Never touch payments, auth, migrations, Supabase, or main branch.
- If William asks "what ideas have I captured this week?" summarize recent `ideas/` files.
- If William says "mark <slug> as triaged/shipped," update only the `status` frontmatter field.

AWKN Ranch context: 12-acre wellness sanctuary in Austin, TX. Retreat house, yurts/domes, Maloka Dome venue, Within Center therapy, hosted retreats, memberships. Raising $500K SAFE at $8M cap. Phase 2: 103 dome residences.

---

> **On-demand docs — load when the task matches:**
> - `docs/CREDENTIALS.md` — **load for:** SQL queries, deploying functions, SSH, API calls
> - `docs/SCHEMA.md` — **load for:** writing queries, modifying tables, debugging data
> - `docs/PATTERNS.md` — **load for:** writing UI code, Tailwind styling, code review, testing
> - `docs/KEY-FILES.md` — **load for:** finding files, understanding project structure
> - `docs/DEPLOY.md` — **load for:** pushing, deploying, version questions
> - `docs/INTEGRATIONS.md` — **load for:** external APIs, vendor setup, pricing
> - `docs/CHANGELOG.md` — **load for:** understanding recent changes, migration context
> - `docs/SECRETS-BITWARDEN.md` — **load for:** Bitwarden CLI, secrets management, vault organization, sharing credentials
> - `docs/OPEN-BRAIN-SETUP.md` — **load for:** Open Brain session dashboard, AI memory, embeddings

> **IMPORTANT: First-time setup!**
> Run `/setup-alpacapps-infra` to set up the full infrastructure interactively.

> **Upgrading from the template?**
> Read `infra/infra-upgrade-guide.md` for step-by-step instructions to sync new features from
> the alpacapps-infra template repo. Machine-readable feature index: `infra/updates.json`

## Mandatory Behaviors

1. After code changes: end response with `vYYMMDD.NN H:MMa [model]` + affected URLs (read `version.json`)
2. Push immediately — GitHub Pages deploys on push to main. See `docs/DEPLOY.md`
3. CI bumps version — never bump locally
4. Run SQL migrations directly — never ask the user to run SQL manually

## Code Guards

- Filter archived items: `.filter(s => !s.is_archived)` client-side
- No personal info in consumer/public views
- `showToast()` not `alert()` in admin
- `openLightbox(url)` for images
- Tailwind: use design tokens from `@theme` block (see `docs/PATTERNS.md`). Run `npm run css:build` after new classes.

## Quick Refs

- **Tech:** Vanilla HTML/JS + Tailwind v4 | Supabase | GitHub Pages
- **Live:** https://USERNAME.github.io/REPO/
- **Architecture:** Browser → GitHub Pages → Supabase (no server-side code)
- **Template repo:** https://github.com/rsonnad/alpacapps-infra
- **Upgrade guide:** `infra/infra-upgrade-guide.md`
