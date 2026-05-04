# Local Dev — AWKN

How to run the AWKN BOS against a local Supabase clone of prod, instead of writing directly to prod during development.

## Why local dev

The AWKN program operates under a **prod-discipline rule**: zero prod DB writes during the refactor. All schema/data exploration happens against a local Supabase clone. Prod gets touched once at end-of-program cutover, against the crystallized schema, with explicit re-approval.

This doc explains how to stand up that local clone and point the BOS at it.

## Prerequisites

- macOS (or Linux with Docker)
- [OrbStack](https://orbstack.dev/) (`brew install --cask orbstack`) — Docker daemon
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- [libpq](https://formulae.brew.sh/formula/libpq) for `psql` (`brew install libpq && brew link --force libpq`)
- A Supabase personal access token from https://supabase.com/dashboard/account/tokens

Verify:

```bash
which supabase && supabase --version    # 2.95+
which docker && docker version          # OrbStack engine
which psql && psql --version             # 16+
```

## First-time setup

1. **Authenticate Supabase CLI:**
   ```bash
   supabase login
   ```

2. **Verify the project link:**
   ```bash
   supabase projects list
   ```
   The AWKNRanch project (`lnqxarwqckpmirpmixcw`) should show with a `●` (linked).

3. **Launch OrbStack** (open the OrbStack app once; daemon stays running across reboots).

4. **Start the local Supabase stack** (from repo root):
   ```bash
   cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
   supabase start
   ```

   Wait ~1 min on first run while Docker pulls images. On success, prints:

   ```
   API URL: http://127.0.0.1:54321
   DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres
   Studio URL: http://127.0.0.1:54323
   anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   service_role key: eyJ...
   ```

   Save the anon key — you'll need it for the BOS toggle (next step).

5. **Dump prod and restore locally** (read-only on prod):
   ```bash
   supabase db dump --linked -f /tmp/awkn-prod-dump.sql
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/awkn-prod-dump.sql
   ```

   The dump uses `pg_dump` inside the Supabase CLI's bundled Docker — no local pg_dump needed. The restore uses `psql` (which is why libpq is a prereq).

   Some warnings about extensions/roles are normal. Verify with a sanity row count:

   ```bash
   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "SELECT COUNT(*) FROM crm_leads;"
   ```

6. **Configure the BOS toggle** (see "Pointing the BOS at local" below).

## Pointing the BOS at local

`shared/supabase.js` supports a runtime toggle to swap prod for local without touching the source on every dev session. Three trigger options:

| Trigger | How |
|---|---|
| URL param | Append `?local=1` to any admin URL — e.g. `http://localhost:8080/spaces/admin/dashboard.html?local=1` |
| `localStorage` | In DevTools console: `localStorage.setItem('awkn_local_db', 'true')` then refresh |
| Window flag | In DevTools console: `window.AWKN_LOCAL_DB = true` then reload the module |

When any trigger is true, the client uses `http://127.0.0.1:54321` and the local anon key. Default behavior is unchanged (prod).

To clear the localStorage trigger:

```js
localStorage.removeItem('awkn_local_db')
```

## Daily workflow

Start the stack:
```bash
supabase start
```

Run BOS locally:
```bash
cd /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN
python3 -m http.server 8080
# Open http://localhost:8080/spaces/admin/dashboard.html?local=1
```

Check stack status:
```bash
supabase status
```

Stop the stack (frees ports + memory):
```bash
supabase stop
```

## Refreshing local from prod

When prod's data drifts ahead of your local clone (someone added rows, ran a migration, etc.):

```bash
# Reset local stack to a clean state (drops all data)
supabase db reset

# Re-dump and restore
supabase db dump --linked -f /tmp/awkn-prod-dump.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/awkn-prod-dump.sql
```

`supabase db reset` rebuilds the local DB from `supabase/migrations/`. After that, the prod dump overlays everything.

## Schema-only refresh (faster, no row data)

If you only need the schema (DDL + extensions, no data):

```bash
supabase db dump --linked --schema public,auth,storage -f /tmp/awkn-schema.sql
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f /tmp/awkn-schema.sql
```

Useful when iterating on schema-aware code where data doesn't matter.

## Edge functions locally

Edge functions can run locally via:

```bash
supabase functions serve <function-name>
```

This runs the Deno-based edge function on `http://127.0.0.1:54321/functions/v1/<name>`. Useful for testing webhook flows without deploying to prod.

## Troubleshooting

**"Cannot connect to the Docker daemon"** — OrbStack isn't running. Open `/Applications/OrbStack.app`.

**"port 54321 already in use"** — A previous `supabase start` is still running. `supabase stop` to free it.

**"role 'authenticator' does not exist"** during dump restore — Normal warning, ignore. Local Supabase ships with the standard roles already.

**BOS hits CORS errors against local** — The local Supabase API allows all origins by default. If you see CORS issues, check the URL — sometimes browsers cache the prod CORS preflight. Hard-refresh.

**`?local=1` doesn't seem to take effect** — Confirm the toggle is set BEFORE `shared/supabase.js` loads. URL params work on first load; localStorage requires a refresh after setting.

## What NOT to do

- **Never run schema migrations against prod during development.** All migrations land in `supabase/migrations/` and apply to local via `supabase db reset`. Prod gets touched only at end-of-program cutover.
- **Never commit the prod connection string or service-role key.** Both are in Supabase dashboard → Project Settings → Database / API.
- **Never let local-stack secrets escape into prod env.** The local anon/service keys are public dev defaults — they grant nothing on prod, but exposing prod keys publicly is the inverse risk.

## Reference

- Audit findings: `docs/superpowers/work/2026-05-04-prod-db-audit.md`
- Cutover runbook (deferred): `docs/migrations/2026-05-04-prod-cleanup-runbook.md`
- Phase 1 plan: `docs/superpowers/plans/2026-05-03-phase-1-alpaca-purge.md`
- Credentials (gitignored): `docs/CREDENTIALS.md`
