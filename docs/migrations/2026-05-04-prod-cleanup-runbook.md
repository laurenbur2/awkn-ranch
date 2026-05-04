# Prod Cleanup Runbook — Phase 1 Pass 5d (deferred to end-of-program cutover)

**Status:** PREPARED — DO NOT RUN until end-of-program cutover with explicit user re-approval.

**Source:** `docs/superpowers/work/2026-05-04-prod-db-audit.md`

## What this replaces

The original Pass 5.5 spec called for a SQL migration to drop Alpaca/IoT/PAI/Vapi tables and functions. The Pass 5.1 audit found **zero schema-layer residue** in prod — all suspect tables, DB functions, and RLS policies were already absent. So the DDL migration becomes empty.

What remains is **edge function undeployment** (originally Pass 2 Task 2.11, deferred per prod-discipline rule).

## Scope: 5 edge functions to undeploy

| Function | Source status | Deleted in |
|---|---|---|
| `vapi-server` | ✅ source removed | Pass 4 Batch A (`e4ea7abb`) |
| `property-ai` | ✅ source removed | Pass 4 Batch A (`e4ea7abb`) |
| `generate-whispers` | ✅ source removed | Pass 4 Batch A (`e4ea7abb`) |
| `nest-control` | ✅ source removed | Pass 2 |
| `tesla-command` | ✅ source removed | Pass 2 |

All five have had their source code deleted from the repo. The deployed instances on prod Supabase are now zombies — they exist on the platform but nothing in the codebase references them.

## Pre-undeploy verification

Before running, confirm one more time that no live caller invokes these functions:

```bash
# Should return zero matches (excluding archive docs)
grep -rln -E "(vapi-server|property-ai|generate-whispers|nest-control|tesla-command)" \
  --include="*.html" --include="*.js" --include="*.ts" --include="*.json" \
  /Volumes/LIVE/Projects/MiracleMind/Clients/AWKN \
  | grep -v "node_modules" \
  | grep -v "^/.*/docs/superpowers/" \
  | grep -v "^/.*/docs/migrations/"
```

Expected: zero hits. If any hit appears, investigate before proceeding.

Also check Supabase Logs for any recent invocations (last 7 days) — if a function is still being called, something external (cron, webhook, Bitwarden secret-bound script) might depend on it. Surface before deleting.

## Undeploy commands

```bash
# Run from repo root with Supabase CLI logged in and linked to AWKNRanch
supabase functions delete vapi-server       --project-ref lnqxarwqckpmirpmixcw
supabase functions delete property-ai       --project-ref lnqxarwqckpmirpmixcw
supabase functions delete generate-whispers --project-ref lnqxarwqckpmirpmixcw
supabase functions delete nest-control      --project-ref lnqxarwqckpmirpmixcw
supabase functions delete tesla-command     --project-ref lnqxarwqckpmirpmixcw
```

Each command is irreversible — the deployed function code is destroyed. Source is gone from the repo so no easy redeploy.

## Post-undeploy verification

```bash
# Should return only AWKN-relevant functions (no vapi/property-ai/whispers/nest/tesla)
supabase functions list --project-ref lnqxarwqckpmirpmixcw \
  | grep -iE "vapi|property-ai|whispers|nest|tesla"
```

Expected: zero matches.

## Bitwarden secrets cleanup (separate manual task)

After undeploy, the corresponding env vars on the Supabase project still exist (`VAPI_API_KEY`, `VAPI_WEBHOOK_SECRET`, `NEST_*`, `TESLA_*`, etc.). They become inert (no function reads them). Cleanup:

1. Supabase dashboard → Project Settings → Edge Functions → Secrets → delete VAPI_*, NEST_*, TESLA_* entries
2. Bitwarden vault → search "vapi" / "nest" / "tesla" → delete or archive matching entries

## Rollback

There is no rollback. If a deployed function turns out to have been load-bearing for some external system not surfaced in the codebase, the recovery path is:
1. `git show <pass-2-or-pass-4-deletion-commit>:supabase/functions/<name>/index.ts > /tmp/restore.ts`
2. Recreate the directory structure
3. `supabase functions deploy <name>`

This is painful by design — the prod-discipline rule says irreversible writes go through user approval. Pre-undeploy verification (section above) is the safety gate.
