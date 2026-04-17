# Handoff: GitHub Account Ban — Root Cause & Required Fix

## TL;DR
The previous GitHub account (`justinwithin`) was suspended because a GitHub Actions workflow was connecting from GitHub's servers out to an external Supabase Postgres database on every push. GitHub's abuse detection flagged this as "using Actions to interact with a third-party service," which violates their Acceptable Use Policies. **As you rebuild the foundation, do not recreate this pattern.**

The current account is `laurenbur2` (repo: `laurenbur2/awkn-within`). We need to avoid the same mistake.

---

## What was happening

The repo contained a workflow file: `.github/workflows/bump-version-on-push.yml`

On every push to `main`, it ran a script (`bump-version.sh`) that used `psql` to:
1. Connect to the Supabase Postgres database (`aws-0-us-west-2.pooler.supabase.com`) using a secret `SUPABASE_DB_URL`.
2. Query for the last release version number.
3. `INSERT` a new release record.
4. Write the new version into the repo and commit it back with `chore: bump version [skip ci]`.

This happened on every push — dozens of times — which is what tripped the automated abuse flag.

### Why this violates GitHub's terms
GitHub Actions is intended to **build, test, and deploy the code in the repo**. Using Actions runners as general-purpose compute that dials out to external services (databases, APIs, scraping targets, etc.) is explicitly disallowed, even for small, legitimate use cases. The detector doesn't care about intent or volume — it matches the shape of the traffic.

### Why we were doing it (the innocent reason)
We wanted automatic version stamping: every push gets a new version number, and the history of releases lives in a durable place. Supabase was being used as a **notebook to remember the last version number across CI runs**. No app data was syncing — it was purely bookkeeping for releases.

---

## The correct way to do this

Keep the version number in a **file committed to the repo**, not in an external database. The repo itself is the durable store.

### Recommended pattern
- Store current version in `version.json` at the repo root.
- Bump it **locally** with a script before pushing (or as a pre-commit hook), not in CI.
- Commit and push the bumped file along with your code changes.
- GitHub Actions' only job is to **deploy** (e.g., the official `deploy-pages.yml`), which never talks to anything outside GitHub.

### Rule of thumb for all future CI workflows
GitHub Actions workflows may only:
- Build the code (compile, bundle, run `npm ci`, etc.)
- Run tests
- Deploy to GitHub-owned surfaces (GitHub Pages, GitHub Packages, GitHub Releases)
- Use official first-party Actions (`actions/checkout`, `actions/deploy-pages`, etc.)

Workflows must **not**:
- Run `psql`, `curl`, `wget`, or any HTTP client against non-GitHub services
- Use secrets that are credentials for external systems (Supabase, Resend, Telnyx, Square, SignWell, R2, Gemini, etc.)
- Push data to, or pull data from, any third-party API

If you find yourself adding a secret to the repo's Actions settings for an external service — stop. That's the shape of the problem.

### Where external-service work *should* happen
Anything that needs to talk to Supabase, Resend, Telnyx, Square, SignWell, R2, or Gemini belongs in one of these places:
- **Supabase Edge Functions** (for webhook handlers and server-side logic)
- **The browser / static site** (for anon-key reads and user-initiated writes)
- **Your local machine** (for migrations, admin scripts, one-off data jobs)

Never in GitHub Actions.

---

## Checklist for the rebuild

- [ ] Do **not** create any `.github/workflows/*.yml` that references `SUPABASE_DB_URL` or any external service credential.
- [ ] Do **not** add Actions secrets for Supabase, Resend, Telnyx, Square, SignWell, Cloudflare R2, or Gemini.
- [ ] Version bumping: keep `version.json` in the repo; bump locally before push (or via a pre-commit hook). CI should never modify it.
- [ ] The only workflow should be something like `deploy-pages.yml` using official `actions/deploy-pages` — nothing else.
- [ ] SQL migrations: run locally via `psql` from your own machine, never from CI.
- [ ] Webhooks from third parties (Telnyx, Square, SignWell, Resend inbound) point to **Supabase Edge Functions**, not to anything on GitHub.

If a teammate or a future Claude session suggests "let's just add a quick GitHub Action that hits Supabase to do X," the answer is **no** — move that logic to a Supabase Edge Function or a local script instead.

---

## Context on the current account
- Current GitHub account: `laurenbur2`
- Current repo: `laurenbur2/awkn-within`
- Previous account `justinwithin` was permanently suspended — not recoverable.
- The ban trigger was automated, not a human review, so the same pattern on the new account will likely get flagged the same way.
