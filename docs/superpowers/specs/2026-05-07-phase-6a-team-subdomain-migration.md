# Phase 6a — Team Subdomain Consolidation + BOS Production-Readiness

**Status:** READY FOR IMPLEMENTATION (post-audit, v2 final)
**Owner:** Matthew Miceli (`miceli` branch)
**Target ship date:** Friday 2026-05-08 (stretch: Monday 2026-05-11)
**Spec author:** Claude Opus 4.7 — drafted 2026-05-06, audited via OpenAI Codex 2026-05-06, revised same day

## TL;DR

Move all team-facing routes (Auth + Team Portal + BOS Admin = 47 routes including `/logged-in`) from the `awknranch` domain to a new `team.awknranch.com` subdomain. Delete the dead Associates surface (4 routes). Auth-gate the team subdomain. In the same pass, ship two production-readiness upgrades:

- **M2** — Centralize the SUPABASE_ANON_KEY (currently hardcoded in 12 sites across crm.js + clients.js)
- **M3** — Wrap 5 highest-risk operator writes (role changes, user deletion, payment link creation, lead deletion, permission reset) in Next.js API routes with bearer-token auth, Origin checks, input validation, and role-matrix enforcement

After this lands locally + on `main`, the long-game React rebuild proceeds page-by-page on a separate dev branch. Production cutover to Vercel is a separate downstream event (see §Production Cutover at end of doc).

## Scope: local implementation, then production cutover later

This plan covers two distinct workstreams that can happen on independent timelines:

**Workstream A — Phase 6a Local Implementation (this spec, focus now):**
- All code changes on `miceli`
- Local verification on `*.localhost` (multi-domain routing works automatically — no DNS or Vercel setup needed for dev)
- Merge `miceli` → `main` when verified
- ✅ This is what we're doing right now

**Workstream B — Phase 6a-Deploy Production Cutover (deferred, see §end of doc):**
- Add `team.awknranch.com` to Vercel project + DNS CNAME
- Pre-deploy checklist (TLS provisioning, env var sync, etc.)
- Operator comms + rollback script
- Promote `main` → Vercel prod
- ⏳ When you're ready to go live (post-implementation)

**Why split:** Local implementation just needs Next.js dev server + `team.localhost`. Browsers auto-resolve `*.localhost` to 127.0.0.1, the proxy.ts maps hostnames to route folders, and we can verify everything end-to-end without touching Vercel or DNS. Deploy infra is a downstream concern that depends on choices the user can make later (DNS provider, exact cutover timing, comms strategy).

### A note on the prior failed attempt

Production deploy DOES have a coupling rule worth carrying forward: phases 6a.5–6a.8 must hit prod *together*, never individually, because deploying just 6a.5 (auth on team) without 6a.7 (BOS on team) would strand operators with a working login that redirects to 404 BOS pages. **This rule applies only when actually deploying to Vercel** — locally and in main-branch state, the four phases can land individually because nothing's serving traffic yet.

## Local impact on existing GitHub Pages legacy site

Most Phase 6a phases live inside `awkn-web-app/` (which isn't deployed anywhere yet — neither GitHub Pages nor Vercel). But two phases touch files that ARE on the legacy GitHub Pages production site at `laurenbur2.github.io/awkn-ranch/` (which auto-deploys on push to main):

| Phase | Legacy impact |
|---|---|
| 6a.1 (M2) | Modifies legacy `spaces/admin/{crm,clients}.js` — replaces hardcoded JWTs with imports from existing `shared/supabase.js`. After main-deploy, legacy admin pages use the centralized client. Should be transparent (replacement uses the same auth pattern other admin pages already use). |
| 6a.4 (Associates delete) | Removes legacy `associates/` directory. After main-deploy, `awknranch.com/associates/*` returns 404 on GitHub Pages. Already approved per IA review. |

All other phases (6a.2 M3, 6a.3 auth gate, 6a.5–6a.7 route moves, 6a.8 redirects, 6a.9 docs) are inside `awkn-web-app/` only — zero legacy GH Pages impact.

---

## Goals

1. **Reorganize ports against the actual mental model**: `awknranch.com` = public marketing, `team.awknranch.com` = the entire AWKN team operating system (auth + portal landing + BOS admin).
2. **Auth-gate the team subdomain** so non-authenticated visitors can't reach BOS pages — except auth-flow pages themselves.
3. **Production-ready M2 + M3 upgrades** — kill scattered JWTs (M2), move riskiest operator actions server-side with proper auth + validation + Origin check (M3).
4. **Delete the dead Associates surface** — confirmed retired per IA review.
5. **Visual + behavioral parity** — every BOS page that worked before still works after, just on a different hostname.
6. **Tight scope discipline** — no repo flattening, no HTML mirroring side quests, no Within Center work, no public-page Reactification. The prior subdomain attempt (Sunday 2026-05-05) was reverted because it got entangled with experimental refactors.

## Non-goals

- React rebuild of any BOS page (deferred to Phase 6b+ on a separate dev branch)
- Within Center port changes
- Within Supabase consolidation (separate stakeholder call)
- Public AWKN Ranch page repackaging (zero forcing function — verified there are no dynamic bits)
- SignWell webhook end-to-end testing (bundled into final UI testing pass at Phase 6a.9 close)
- Persistent audit log table for M3 mutations (Phase 6b — for now, structured `console.log` is the trail)
- Migration of legacy session from localStorage to HttpOnly cookies (Phase 6b — current plan keeps legacy session intact and uses bearer tokens for Server Action auth)

---

## Risk register (28 risks, all pre-mitigated — incorporates 30-item Codex audit)

**Risk severity is unchanged from v2 audit, but several risks (#1, #2, #15, #17, #20, #21) only materialize at production cutover. They're held in §Production Cutover until then.**

| # | Severity | Risk | Mitigation | Phase |
|---|---|---|---|---|
| 1 | CRITICAL (production-only) | Deploying 6a.5 to Vercel prod without 6a.7 strands operators (working login redirects to 404 BOS) | 6a.5–6a.8 ship as a coupled bundle in the production cutover. Local implementation is unaffected — nothing's serving traffic until Vercel goes live. See §Production Cutover. | 6a-Deploy |
| 2 | CRITICAL (production-only) | Reverting 6a.7 in prod without reverting 6a.8 leaves 301s pointing to team while routes live on awknranch (404 loop) | Coupled rollback order: revert 6a.8 → 6a.7 → 6a.6 → 6a.5. Documented in `scripts/rollback-6a-stack.sh` (created during 6a-Deploy). Never revert mid-bundle in prod. | 6a-Deploy |
| 3 | CRITICAL | M3 Server Actions assume a server-readable session, but legacy auth is browser-only localStorage | M3 uses **bearer-token** auth: legacy JS reads `supabase.auth.getSession().access_token` from the existing localStorage session and sends it in the `Authorization: Bearer <token>` header. Server validates the token via `supabase.auth.getUser(token)` before escalating to service-role for the actual mutation. | 6a.2 |
| 4 | CRITICAL | Privileged Server Actions vulnerable to CSRF if cookies are ever introduced | Bearer-token approach (instead of cookies) is naturally CSRF-immune (browsers don't auto-attach Authorization headers cross-origin). Plus explicit `Origin` header allowlist enforced in every API route. | 6a.2 |
| 5 | MAJOR | `/logged-in` host placement undecided | **Locked decision: move to team.** New path: `team.awknranch.com/logged-in`. Phase-2 stub at `team/logged-in/page.tsx` doesn't exist (verified). | 6a.6 |
| 6 | MAJOR | No per-operation role matrix; "admin only" is too coarse | Explicit role matrix per Server Action documented in 6a.2. Each handler enforces its own allowlist via `app_users.role` lookup. | 6a.2 |
| 7 | MAJOR | Server Actions accept arbitrary IDs/bodies with service-role key — risk of unintended deletes/amounts | All inputs validated with Zod schemas (already in repo via `~/server/api`). UUIDs constrained, payment amounts within range, role values from enum. | 6a.2 |
| 8 | MAJOR | No durable audit trail for M3 mutations | Structured `console.log` in each handler with `{ actor, action, target, timestamp, payload }`. Captured by Vercel function logs. Persistent audit table deferred to Phase 6b. **Risk acknowledged as the cost of the lean baseline.** | 6a.2 |
| 9 | MAJOR | `/api/team/*` reachable from awknranch.com or open internet | Each handler enforces `Origin` header allowlist: `https://team.awknranch.com`, `http://team.localhost:3000` (and Vercel preview domain at deploy time). Mismatched origin returns 403. | 6a.2 |
| 10 | MAJOR (production-only) | `SUPABASE_SERVICE_ROLE_KEY` not in Vercel env yet | Local impl uses `.env.local` (already populated). Vercel env var setup deferred to §Production Cutover. | 6a-Deploy |
| 11 | MAJOR | AUTH_FLOW_PATHS gate uses `startsWith` — vulnerable to path traversal (`/login/../spaces/admin`, percent-encoded variants) | Path normalized via `new URL(pathname, origin).pathname` BEFORE allowlist check. Reject anything containing `..` or encoded slashes (`%2e%2e`, `%2f`). Exact-match or single-level prefix only. | 6a.3 |
| 12 | MAJOR | Auth gate doesn't restrict HTTP method — POST to `/login/reset-password` could bypass auth even if it's a privileged endpoint | Method-aware gate: GET/HEAD allowed for auth-flow routes (they're rendering pages); other methods enforced via per-route handlers + Origin check. The current ports are all GET (Route Handlers), so this risk is currently theoretical but baked into the spec for forward safety. | 6a.3 |
| 13 | MAJOR | `domain.authRequired` config for `team` not yet verified | Verified in `awkn-web-app/src/lib/domains.ts`: `team` has `authRequired: true` (set during 2026-05-06 bos→team rename). Re-confirmed in 6a.3 verification. | 6a.3 |
| 14 | MAJOR | `team/` already has 39 RouteStub Phase-2 stubs that conflict with new Route Handlers | Pre-enumerated in 6a.7; deleted in same commit as each batch of route moves | 6a.5–6a.7 |
| 15 | MAJOR (production-only) | Legacy session lives in `localStorage[awkn-ranch-auth]` — per-origin, won't carry across subdomains | Operators sign in fresh on `team.awknranch.com` post-cutover. Documented in §Production Cutover operator comms. Local impl unaffected (operators don't have prod sessions to lose). | 6a-Deploy |
| 16 | MAJOR | Some BOS pages have hardcoded `awknranch.com` absolute URLs in HTML/JS that break on team subdomain | Pre-deploy asset audit (script in 6a.7) greps for hardcoded hostnames in `spaces/admin/*`, surfaces any matches for surgical fix. The existing `bosPort: true` rewrite handles `/awkn-ranch/` GH-Pages-prefix URLs but doesn't touch absolute hostnames — known gap. | 6a.7 |
| 17 | MAJOR (production-only) | Inbound legacy redirect `/spaces/admin/dashboard` after login bounces hosts post-cutover | All auth-related routes deploy together (6a.5–6a.8 production bundle). Within team subdomain, the relative redirect resolves correctly. No cross-host bouncing because BOS is also on team. Local impl: relative redirect resolves to `team.localhost:3000/spaces/admin/dashboard` — works. | 6a-Deploy |
| 18 | MAJOR | 301 redirects need to cover `www.awknranch.com`, `awknranch.vercel.app`, plus `/api/*` and webhook callback paths | Redirect rules enumerated explicitly in 6a.8: cover bare host, `www`, Vercel preview/prod hosts. `/api/*` redirects added. `/api/webhooks/*` paths excluded (webhook callers have URLs registered against awknranch — see #19). | 6a.8 |
| 19 | MAJOR | Third-party webhook URLs (Stripe, SignWell, Resend, Square) registered against `awknranch.com` | **Strategy: keep webhook handlers on awknranch.com host** (no redirect for `/api/webhooks/*` paths). The webhook handlers run as Vercel functions on the same project, just served from awknranch.com. No vendor-side URL changes needed. Documented in 6a.8. | 6a.8 |
| 20 | MAJOR (production-only) | DNS provider proxy/CDN mode can interfere with Vercel SSL provisioning | Documented in §Production Cutover. DNS-provider-agnostic: whatever provider hosts the domain, configure CNAME with proxy/CDN OFF for the team subdomain. | 6a-Deploy |
| 21 | MAJOR (production-only) | Vercel SSL cert may not be issued before deploy → first hits return cert errors | Pre-cutover verification step: `dig` + `curl -v https://team.awknranch.com/` confirms TLS valid before promoting. | 6a-Deploy |
| 22 | MAJOR | SEO impact of moving auth/admin to team subdomain | New `team/robots.txt` with `Disallow: /` (admin pages should never be indexed). Update awknranch sitemap to remove BOS paths. Verified in 6a.7. | 6a.7 |
| 23 | MAJOR | Verification only checks 200/404 status — misses asset 404s, broken UI, JS errors | Per-batch verification adds: (a) HTML response grep for `awknranch.com` hardcoded refs, (b) browser-tab smoke test on 5 representative pages with DevTools network panel open, (c) console error count assertion (target: zero unexpected errors). | each phase |
| 24 | MAJOR | Operators have cached login pages on `awknranch.com/login` that won't reflect the redirect | Operator comms (6a.8) include "hard-refresh" instruction. No service workers in repo (verified — `awkn-web-app/public/` has no `sw.js`, `manifest.json` etc.), so cache invalidation is just a Cmd+Shift+R. | 6a.8 |
| 25 | MAJOR | `feedback_prod-db-discipline` says no prod DB writes during refactor; 6a.2 verification needs prod writes (test role change, test delete user) | **Carve-out documented**: M3 verification creates and immediately cleans up a test user (`test-m3-verification@awknranch.com`). Documented as an explicit exception. Real customer data NEVER touched in 6a verification. | 6a.2 |
| 26 | MAJOR | M2 changes both legacy `spaces/admin/*.js` AND `awkn-web-app/public/spaces/admin/*.js` mirrors — they're out of sync today | Mirror resync is part of 6a.1 commit. Add a `scripts/sync-bos-mirror.sh` helper to make future syncs trivial. | 6a.1 |
| 27 | MAJOR | Service role Supabase client uses `process.env.NEXT_PUBLIC_SUPABASE_URL` — fails silently if env not set in Vercel | Server-side handler instantiation reads from server-only env vars (`SUPABASE_URL` not `NEXT_PUBLIC_`); fails fast at runtime with clear error if absent. | 6a.2 |
| 28 | MINOR | Future Claude session resuming mid-stack needs to know "deploy stack" rule | Implementation Playbook section explicitly calls out the deploy-stack constraint. STATUS.md updated each phase to surface "deploy gate not yet open" / "deploy gate open". | 6a.9 |

### Lessons from prior 2026-05-05 attempt

The prior `f9c06c4d refactor(bos): move 39 admin pages from awknranch to bos hostname` was **technically successful** ("48/48 routes pass" per its verification). The reset to `f4c37072` happened because that commit got bundled with experimental repo restructuring (`flatten awkn-web-app to repo root`, `mirror 105 HTML files`, etc.). The user threw out the entire batch when one experimental commit went sideways.

**Lesson: scope discipline + tight commit boundaries.** This time:
- 9 commits, each individually revert-safe
- Deploy stack defined explicitly (4 commits ship as a unit)
- Zero "while we're at it" cleanup
- Tangential work goes to separate PRs that can be reverted independently

---

## Phase structure

| Phase | Title | Local-only | Affects legacy GitHub Pages on main-deploy |
|---|---|---|---|
| 6a.1 | M2: Centralize SUPABASE_ANON_KEY | Yes | Yes (legacy admin pages auto-deploy) |
| 6a.2 | M3: Server Actions for risky writes | Yes | No (awkn-web-app only) |
| 6a.3 | Auth gate update on team subdomain | Yes | No |
| 6a.4 | Delete Associates surface | Yes | Yes (associates pages 404 on GitHub Pages) |
| 6a.5 | Move Auth routes to team (5 routes) | Yes | No |
| 6a.6 | Move Team Portal routes to team (3 routes incl. /logged-in) | Yes | No |
| 6a.7 | Move BOS Admin routes + add team robots.txt (39 routes) | Yes | No |
| 6a.8 | next.config.js redirects (ready for prod) | Yes | No |
| 6a.9 | STATUS / TODO / memory updates | Yes | No |

For production cutover (Vercel domain config, DNS CNAME, operator comms, etc.) see **§Production Cutover** at end of doc — deferred until you're ready to go live.

Each phase below has: prerequisites, deliverables, verification, rollback. Designed so a future Claude session can pick up cold from any phase boundary.

---

### Local impl prereqs — none

`.env.local` already contains all secrets. `*.localhost` resolves automatically. The local dev server (`cd awkn-web-app && npm run dev`) is the only thing that needs to be running. Code work begins immediately at 6a.1.

**Constraint reminder:** No prod DB writes during 6a code work (per `feedback_prod-db-discipline`). M3 verification carve-out documented in 6a.2.

For Vercel + DNS prereqs (deferred until production cutover), see **§Production Cutover** at end of doc.

### 6a.1 — M2: Centralize the SUPABASE_ANON_KEY

**Prerequisite:** None (independent).

**Scope:** Replace 12 hardcoded JWT sites in legacy `spaces/admin/{crm,clients}.js` + 8 sites in `awkn-web-app/public/spaces/admin/` mirror with imports from `shared/supabase.js`.

#### Concrete sites — legacy (`spaces/admin/`)

| File | Line | Type |
|---|---|---|
| crm.js | 1358 | apikey header in fetch |
| crm.js | 1628 | const anonKey assignment |
| crm.js | 1661 | const anonKey assignment |
| crm.js | 1688 | const anonKey assignment |
| crm.js | 2087 | apikey header in fetch |
| crm.js | 3011 | Authorization: Bearer header |
| crm.js | 3012 | apikey header (same fetch as 3011) |
| crm.js | 3692 | const anonKey assignment |
| clients.js | 2259 | const SUPABASE_ANON_KEY (module-level) |
| clients.js | 3426 | const anonKey (function-local) |

#### Concrete sites — awkn-web-app/public mirror (out of sync)

| File | Line | Notes |
|---|---|---|
| public/spaces/admin/crm.js | 1349, 1619, 1652, 1679, 2078, 3518 | 6 sites — missing the 3011/3012 pair (mirror is stale; Justin's recent invoice work hasn't been mirrored) |
| public/spaces/admin/clients.js | 2259, 3426 | 2 sites |

#### Strategy

`shared/supabase.js` already exports a configured `supabase` client used by other admin pages. Two replacement patterns depending on use:

**Pattern A — supabase.functions.invoke() (preferred):**
```js
// BEFORE (raw fetch)
const r = await fetch(supabaseUrl + '/functions/v1/create-payment-link', {
  headers: { 'apikey': 'eyJhbGc...', 'Authorization': 'Bearer eyJhbGc...' },
  body: JSON.stringify({ amount, ... }),
});

// AFTER (uses configured client)
import { supabase } from '../../shared/supabase.js';
const { data, error } = await supabase.functions.invoke('create-payment-link', {
  body: { amount, ... },
});
```

**Pattern B — keep raw fetch, import constant:**
```js
// shared/supabase.js — add at top of file
export const SUPABASE_ANON_KEY = PROD_ANON_KEY;
export const SUPABASE_URL = PROD_URL;

// crm.js
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../../shared/supabase.js';
'apikey': SUPABASE_ANON_KEY,
```

Use Pattern A wherever possible (cleaner; uses already-configured auth). Pattern B for any fetch where invoke() doesn't fit (e.g., direct table queries).

#### Resync the public mirror

After updating legacy files, mirror them:
```bash
# scripts/sync-bos-mirror.sh (NEW — add in this commit)
#!/bin/bash
set -e
SRC=spaces/admin
DST=awkn-web-app/public/spaces/admin
for f in crm.js clients.js; do
  cp "$SRC/$f" "$DST/$f"
  echo "Synced $f"
done
```

Make executable (`chmod +x scripts/sync-bos-mirror.sh`) and run it as part of this commit.

#### Verification

```bash
# Should return 0 hits in legacy + public:
grep -rE 'eyJ[A-Za-z0-9_-]{20,}' spaces/admin/ awkn-web-app/public/spaces/admin/ | grep -v supabase.js
echo "(empty above = clean)"
```

Smoke-test 3 admin pages that exercise the formerly-hardcoded paths in dev:
- `awknranch.localhost:3000/spaces/admin/crm` — load + verify CRM list renders, Send Invoice flow exercises the create-payment-link fetch
- `awknranch.localhost:3000/spaces/admin/clients` — load + verify Clients table renders
- `awknranch.localhost:3000/spaces/admin/users` — verify role display works (clients.js path)

DevTools network tab: confirm no 401/403 on Supabase requests.

#### Rollback

`git revert <6a.1-commit>` — pure file-content changes, no infrastructure dependencies, atomic.

### 6a.2 — M3: Server Actions for risky writes

**Prerequisite:** 6a.1 (cleaner if the supabase client is centralized first — not strict).

**Scope:** 5 highest-risk operator writes get Next.js API Route Handlers with bearer-token auth + Origin allowlist + Zod validation + role-matrix enforcement. Legacy JS calls them via `fetch()` with the operator's Supabase access token.

#### The 5 operations + role matrix

| # | Operation | Legacy site | New endpoint | Allowed roles |
|---|---|---|---|---|
| 1 | Change user role | `users.js:776` (`.from('app_users').update({ role })`) | `PATCH /api/team/users/[id]/role` | `admin` only |
| 2 | Delete user | `users.js:797` (`.from('app_users').delete()`) | `DELETE /api/team/users/[id]` | `admin` only |
| 3 | Reset user permissions | `users.js:1508,1525` (delete on `user_permissions`) | `DELETE /api/team/users/[id]/permissions` | `admin` only |
| 4 | Create Stripe payment link | `crm.js:2938` (fetch to edge fn) | `POST /api/team/payments/create-link` | `admin`, `staff` |
| 5 | Delete CRM lead | `crm.js:2376` (`.from('crm_leads').delete()`) | `DELETE /api/team/leads/[id]` | `admin`, `staff` |

The role allowlist for each op is derived from the current legacy UI gating in `users.js` and `crm.js` — these mirror what the UI lets the operator click today. Locking it server-side prevents UI-bypass attacks.

#### Auth pattern (bearer token, NOT cookies)

Legacy JS reads the Supabase session and sends the access token:

```js
// users.js — replacing line 776
import { supabase } from '../../shared/supabase.js';

async function changeUserRole(userId, newRole) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    showToast('Not signed in', 'error');
    return;
  }

  const res = await fetch(`/api/team/users/${userId}/role`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    credentials: 'omit',  // explicitly no cookies — pure bearer
    body: JSON.stringify({ role: newRole }),
  });

  if (!res.ok) {
    const { error } = await res.json();
    showToast(`Role change failed: ${error}`, 'error');
    throw new Error(error);
  }
  showToast('Role updated', 'success');
}
```

Server Action validates token + role matrix:

```ts
// awkn-web-app/src/app/api/team/users/[id]/role/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const ALLOWED_ORIGINS = [
  "https://team.awknranch.com",
  "http://team.localhost:3000",
  process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
].filter(Boolean) as string[];

const ALLOWED_ROLES_FOR_THIS_OP = ["admin"] as const;
const VALID_ROLES = ["admin", "staff", "demo", "resident", "associate", "public"] as const;

const RoleChangeSchema = z.object({
  role: z.enum(VALID_ROLES),
});

const UuidSchema = z.string().uuid();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // 1. Origin check — reject cross-origin/missing-origin requests
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return Response.json({ error: "Forbidden origin" }, { status: 403 });
  }

  // 2. Bearer token extraction
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) {
    return Response.json({ error: "Missing bearer token" }, { status: 401 });
  }

  // 3. Validate token via Supabase auth
  const userClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return Response.json({ error: "Invalid session" }, { status: 401 });
  }

  // 4. Role matrix enforcement
  const { data: appUser, error: roleErr } = await userClient
    .from("app_users")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();
  if (roleErr || !appUser) {
    return Response.json({ error: "User not found" }, { status: 403 });
  }
  if (!ALLOWED_ROLES_FOR_THIS_OP.includes(appUser.role as any)) {
    return Response.json({ error: "Insufficient role" }, { status: 403 });
  }

  // 5. Validate path param + body
  const { id } = await params;
  const idResult = UuidSchema.safeParse(id);
  if (!idResult.success) {
    return Response.json({ error: "Invalid user id" }, { status: 400 });
  }
  const bodyRaw = await req.json().catch(() => null);
  const bodyResult = RoleChangeSchema.safeParse(bodyRaw);
  if (!bodyResult.success) {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  // 6. Audit log (structured — captured by Vercel function logs)
  console.log(JSON.stringify({
    audit: "M3.role_change",
    actor: { auth_user_id: user.id, role: appUser.role },
    target: { app_user_id: idResult.data },
    payload: { new_role: bodyResult.data.role },
    timestamp: new Date().toISOString(),
  }));

  // 7. Privileged mutation via service-role client
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await admin
    .from("app_users")
    .update({ role: bodyResult.data.role })
    .eq("id", idResult.data)
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ user: data });
}
```

The other 4 endpoints follow the same template with their own Zod schemas, role allowlists, and mutations.

#### Why bearer + no cookies

- **CSRF immunity:** Browsers don't auto-attach `Authorization` headers to cross-origin requests; only same-origin code that explicitly knows the token can call. CSRF is a non-issue.
- **No cookie-domain complexity:** Avoids the cross-subdomain cookie sharing problem. Phase 6b can introduce HttpOnly cookies if/when we want session sharing across team and portal.
- **Compatible with legacy localStorage session:** The token already exists; we just pipe it through.

#### Verification (with explicit prod-DB carve-out)

For each of the 5 operations, in dev:

1. **Happy path:** Call from BOS UI as admin → operation succeeds → DB state changes correctly
2. **Auth gate:** Call without bearer → 401
3. **Role gate:** Call with a `staff` operator's token against an admin-only endpoint → 403
4. **Origin gate:** Call from `awknranch.localhost` (different origin) → 403
5. **Validation gate:** Call with invalid UUID → 400; invalid body → 400
6. **Audit log:** Verify a structured `M3.<op>` log line appears in Vercel function logs

**Carve-out for prod-DB-discipline:** Verification uses ONE explicitly-created test user with email `test-m3-verification@awknranch.com`. Created at start of verification, deleted at end. No real customer data touched. The test user is created via Supabase Studio (operator action, NOT automated by Claude).

#### Rollback

`git revert <6a.2-commit>` reverts the 5 endpoint files + the legacy JS changes. The legacy JS would resume direct Supabase calls. Atomic. Note: any audit log entries already written persist in Vercel logs (informational only).

### 6a.3 — Auth gate update on team subdomain

**Prerequisite:** 6a.0 (Vercel + DNS setup).

**Scope:** Patch `awkn-web-app/src/proxy.ts` to allow auth-flow paths through the gate, with proper path normalization to prevent traversal bypasses.

#### Current behavior (proxy.ts:58-67)

```ts
if (domain.authRequired && !authDisabled) {
  const session = await updateSession(request);
  if (!session.user && pathname !== "/login") {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}
```

#### New behavior

```ts
const AUTH_FLOW_PATHS = [
  "/login",
  "/login/reset-password",
  "/login/update-password",
  "/admin/email-approved",
  "/admin/email-confirm",
];

function isAuthFlowPath(pathname: string): boolean {
  // Reject anything containing `..` or encoded slashes BEFORE matching
  if (pathname.includes("..") || /%2[ef]/i.test(pathname)) {
    return false;
  }
  // Normalize via URL (resolves any remaining traversal)
  let normalized: string;
  try {
    normalized = new URL(pathname, "http://localhost").pathname;
  } catch {
    return false;
  }
  // Strip trailing slash
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  // Exact match against allowlist
  return AUTH_FLOW_PATHS.includes(normalized);
}

if (domain.authRequired && !authDisabled) {
  // Method gate: only GET/HEAD allowed unauthenticated for auth UI
  // (POST to login etc. should go through Supabase directly, not through our pages)
  const method = request.method.toUpperCase();
  const isReadMethod = method === "GET" || method === "HEAD";

  const session = await updateSession(request);
  const isAllowed = isReadMethod && isAuthFlowPath(pathname);

  if (!session.user && !isAllowed) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
}
```

#### Pre-flight: confirm `team` is `authRequired: true`

Verify in `awkn-web-app/src/lib/domains.ts`:

```bash
grep -A3 'key: "team"' awkn-web-app/src/lib/domains.ts | grep authRequired
# Expected: authRequired: true,
```

(Confirmed during 2026-05-06 bos→team rename; commit `12195dc4`.)

#### Verification (with `NEXT_PUBLIC_DISABLE_AUTH=false` in `.env.local`)

```bash
# Restart dev server first (env var change requires reload)

# Gated paths redirect to login when logged out:
curl -s -o /dev/null -w "%{http_code}\n" -H "Host: team.localhost" "http://localhost:3000/spaces/admin/dashboard"
# Expected: 307

# Auth-flow paths are allowed through:
for p in /login /login/reset-password /login/update-password /admin/email-approved /admin/email-confirm; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: team.localhost" "http://localhost:3000${p}")
  echo "${code}  team.localhost${p}"
done
# Expected: 5× 200 (because routes will exist after 6a.5; before then they 404)

# Path traversal attacks REJECTED:
for p in "/login/../spaces/admin/dashboard" "/login%2f..%2fspaces%2fadmin%2fdashboard" "/login/../../etc/passwd"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: team.localhost" "http://localhost:3000${p}")
  echo "${code}  team.localhost${p}"
done
# Expected: 307 (redirect to login — traversal rejected)

# Method restriction:
curl -s -X POST -o /dev/null -w "%{http_code}\n" -H "Host: team.localhost" "http://localhost:3000/login"
# Expected: 307 (POST not in read-method allowlist)
```

#### Rollback

Pure proxy.ts edit. `git revert` is atomic and safe.

### 6a.4 — Delete Associates surface

**Prerequisite:** None (independent).

**Scope:** Mirror of the public-spaces purge from 2026-05-06.

#### Files to delete

| Layer | Files |
|---|---|
| Route Handlers | `awkn-web-app/src/app/awknranch/(internal)/associates/{route.ts, projects/route.ts, projectinquiry/route.ts, worktracking/route.ts}` |
| Legacy source | `associates/` directory: `index.html`, `projects.html`, `projects.js`, `projectinquiry.html`, `projectinquiry.js`, `worktracking.html`, `worktracking.js` |
| Public mirrors | `awkn-web-app/public/associates/{projects.js, projectinquiry.js, worktracking.js}` |
| Manifest | 4 entries from `awkn-web-app/src/lib/port-status.ts` (the "Associates" group) |
| Routes manifest | The `associates` block in `awkn-web-app/src/lib/routes.ts` if present |
| Scaffold | `associates` block in `awkn-web-app/scripts/scaffold-stubs.mjs` if present |

#### Verification

```bash
for p in /associates /associates/projects /associates/projectinquiry /associates/worktracking; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: awknranch.localhost" "http://localhost:3000${p}")
  echo "${code}  awknranch.localhost${p}"
done
# Expected: 4× 404
```

#### Rollback

`git revert` restores files from history. Atomic.

---

### 6a.5 — Move Auth routes to team subdomain (5 routes)

**Prerequisite:** 6a.3 done (auth gate patched).

#### Moves

| From | To |
|---|---|
| `awknranch/(internal)/login/route.ts` | `team/(internal)/login/route.ts` |
| `awknranch/(internal)/login/reset-password/route.ts` | `team/(internal)/login/reset-password/route.ts` |
| `awknranch/(internal)/login/update-password/route.ts` | `team/(internal)/login/update-password/route.ts` |
| `awknranch/(internal)/admin/email-approved/route.ts` | `team/(internal)/admin/email-approved/route.ts` |
| `awknranch/(internal)/admin/email-confirm/route.ts` | `team/(internal)/admin/email-confirm/route.ts` |

#### Phase-2 stub conflicts

`awkn-web-app/src/app/team/login/page.tsx` already exists (Phase-2 RouteStub). Conflicts with new `team/(internal)/login/route.ts`. **Delete in same commit.**

#### `(internal)` layout

Create `awkn-web-app/src/app/team/(internal)/layout.tsx` — bare wrapper:

```tsx
export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

This ensures Route Handlers under `(internal)` (and any future page.tsx) bypass the team-level `<DomainNav>` chrome.

#### Manifest update

Flip 5 Auth entries' `domain` from `"awknranch"` to `"team"` in `port-status.ts`.

#### Asset audit

Before completing this commit, scan for hardcoded `awknranch.com` references in the legacy auth files:

```bash
grep -rE 'awknranch\.com|laurenbur2\.github\.io' login/ admin/email-approved.html admin/email-confirm.html 2>/dev/null
```

Surface and fix any matches (likely few — these are auth flow pages with mostly relative refs).

#### Verification

```bash
# 5 paths 200 on team.localhost:
for p in /login /login/reset-password /login/update-password /admin/email-approved /admin/email-confirm; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: team.localhost" "http://localhost:3000${p}")
  echo "${code}  team.localhost${p}"
done
# Expected: 5× 200

# Same paths 404 on awknranch.localhost:
for p in /login /login/reset-password /login/update-password /admin/email-approved /admin/email-confirm; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: awknranch.localhost" "http://localhost:3000${p}")
  echo "${code}  awknranch.localhost${p}"
done
# Expected: 5× 404

# Manual smoke: load team.localhost:3000/login in browser, verify form renders, fonts load, no console errors
```

#### Rollback

`git revert <6a.5-commit>` restores routes to awknranch + brings back the team/login Phase-2 stub. **WARNING:** if reverted in isolation while 6a.7 + 6a.8 remain, the deploy is broken. Use `scripts/rollback-6a-stack.sh` (defined in 6a.8) for safe sequenced rollback.

### 6a.6 — Move Team Portal routes + /logged-in to team subdomain (3 routes)
**Prerequisite:** 6a.5 done.

#### Moves

| From | To |
|---|---|
| `awknranch/(internal)/portal/route.ts` | `team/(internal)/route.ts` (mounted at root) |
| `awknranch/(internal)/portal/team-chart/route.ts` | `team/(internal)/team-chart/route.ts` |
| `awknranch/(internal)/logged-in/page.tsx` | `team/(internal)/logged-in/page.tsx` |

**URL changes** (per locked decision):
- `/portal/` → `/` (bare team.awknranch.com is the sign-in landing)
- `/portal/team-chart/` → `/team-chart/`
- `/logged-in` → stays as `/logged-in` (just hostname change)

#### Phase-2 stub conflicts

- `awkn-web-app/src/app/team/page.tsx` (Phase-2 RouteStub) — conflicts with new `team/(internal)/route.ts` at `/`. **Delete.**
- No conflict for `/team-chart/` or `/logged-in` (Phase-2 stubs don't have these paths under team).

#### Manifest update

Update 3 entries in `port-status.ts`:
- `/portal` → `/` with `domain: "team"`
- `/portal/team-chart` → `/team-chart` with `domain: "team"`
- Add new entry for `/logged-in` with `domain: "team"` (was previously implicit/unmanifested)

#### Verification

```bash
# Team root, team-chart, logged-in 200 on team.localhost:
for p in / /team-chart /logged-in; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: team.localhost" "http://localhost:3000${p}")
  echo "${code}  team.localhost${p}"
done
# Expected: 3× 200

# Old paths 404 on awknranch.localhost:
for p in /portal /portal/team-chart /logged-in; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: awknranch.localhost" "http://localhost:3000${p}")
  echo "${code}  awknranch.localhost${p}"
done
# Expected: 3× 404
```

#### Rollback

`git revert <6a.6-commit>`. Same deploy-stack warning as 6a.5.

### 6a.7 — Move BOS Admin routes + add team robots.txt (39 routes + robots)
**Prerequisite:** 6a.5 + 6a.6 done.

**Scope:** Move all 39 Route Handlers from `awknranch/(internal)/spaces/admin/*` to `team/(internal)/spaces/admin/*`. URL paths preserve the `/spaces/admin/` prefix per locked decision (least disruptive — only hostname changes).

#### The 39 routes (alphabetical for sed-replace)

```
accounting        appdev           brand            clients
crm               dashboard        devcontrol       events
facilitators      faq              highlights-order
job-titles        manage           media            memberships
packages          passwords        phyprop          planlist
projects          purchases        releases         rentals
reservations      retreat-house    scheduling       settings
sms-messages      spaces           staff            templates
testdev           users            venue-clients    venue-events
venue-spaces      within-schedule  worktracking     index
```

#### Phase-2 stub conflict enumeration

```bash
# Pre-implementation audit script — run first to enumerate:
ROUTES="accounting appdev brand clients crm dashboard devcontrol events facilitators faq highlights-order index job-titles manage media memberships packages passwords phyprop planlist projects purchases releases rentals reservations retreat-house scheduling settings sms-messages spaces staff templates testdev users venue-clients venue-events venue-spaces within-schedule worktracking"
for X in $ROUTES; do
  if [ -f "awkn-web-app/src/app/team/$X/page.tsx" ]; then
    echo "CONFLICT: awkn-web-app/src/app/team/$X/page.tsx (delete)"
  fi
done
```

Delete each conflict in the same commit as the corresponding move.

#### `serveLegacyHtml` rewrite still applies

The `bosPort: true` option strips `/awkn-ranch/` prefix and `/assets/branding/` rewrites — these are hostname-independent. No change needed.

Confirm one moved Route Handler:
```ts
// team/(internal)/spaces/admin/dashboard/route.ts (after move)
import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("spaces/admin/dashboard.html", { bosPort: true });
}
```

#### Asset audit

Before finalizing, grep for hardcoded `awknranch` URLs in the legacy BOS files:

```bash
grep -rnE 'awknranch\.com|laurenbur2\.github\.io|//awknranch' \
  spaces/admin/ awkn-web-app/public/spaces/admin/ awkn-web-app/public/shared/ \
  2>/dev/null | grep -v '/* ' | head -20
```

For each match, decide:
- **Public marketing link** (e.g., href to `awknranch.com/about`): keep as-is, public site is still on awknranch
- **Self-reference for admin** (e.g., redirect to `awknranch.com/spaces/admin/...`): rewrite to use relative URLs, document in commit message
- **API base URL hardcoded as `awknranch.com/api/...`**: change to relative

Surface the matches in commit message; surgical fixes go in same commit.

#### Robots.txt for team subdomain

Create `awkn-web-app/src/app/team/robots.txt/route.ts`:

```ts
export function GET() {
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: { "Content-Type": "text/plain" },
  });
}
```

This prevents search engines from indexing any team subdomain URL. Admin pages should never be in search results.

#### Manifest update

Flip 39 BOS Admin entries' `domain` from `"awknranch"` to `"team"`. Mechanical sed-replace.

#### `awknranch/(internal)/spaces/admin/` directory cleanup

After moving all 39, remove the empty parent directory:
```bash
rm -rf 'awkn-web-app/src/app/awknranch/(internal)/spaces/admin'
```

#### Verification (per-route)

```bash
ROUTES="accounting appdev brand clients crm dashboard devcontrol events facilitators faq highlights-order index job-titles manage media memberships packages passwords phyprop planlist projects purchases releases rentals reservations retreat-house scheduling settings sms-messages spaces staff templates testdev users venue-clients venue-events venue-spaces within-schedule worktracking"

# All 39 should 200 on team.localhost:
for X in $ROUTES; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: team.localhost" "http://localhost:3000/spaces/admin/$X")
  if [ "$code" != "200" ]; then echo "FAIL: $X ($code)"; fi
done
echo "(silence = all 200)"

# Same routes 404 on awknranch.localhost:
for X in $ROUTES; do
  code=$(curl -s -o /dev/null -w "%{http_code}" -H "Host: awknranch.localhost" "http://localhost:3000/spaces/admin/$X")
  if [ "$code" != "404" ]; then echo "FAIL (should be 404): $X ($code)"; fi
done
echo "(silence = all 404)"

# Robots.txt:
code=$(curl -s -H "Host: team.localhost" "http://localhost:3000/robots.txt")
echo "$code"  # Expected: "User-agent: *\nDisallow: /"
```

Manual browser verification on 5 representative pages with DevTools open:
- `team.localhost:3000/spaces/admin/dashboard` — chrome renders, no console errors, no 404'd assets
- `team.localhost:3000/spaces/admin/crm` — CRM list renders, M2 fetches succeed
- `team.localhost:3000/spaces/admin/clients` — Clients table renders
- `team.localhost:3000/spaces/admin/within-schedule` — Justin's Edit button visible + functional
- `team.localhost:3000/spaces/admin/users` — role-change UI works (exercises M3 endpoint)

#### Rollback

`git revert <6a.7-commit>`. Deploy-stack warning applies.

### 6a.8 — next.config.js redirects + Vercel deploy prep + rollback script
**Prerequisite:** 6a.5 + 6a.6 + 6a.7 done.

**Scope:**
1. Add 301 redirects from `awknranch.com/{auth,portal,bos,/logged-in}` paths → `team.awknranch.com/...`
2. Pre-deploy verification checklist
3. Create `scripts/rollback-6a-stack.sh` for emergency revert
4. Operator comms doc for cutover

#### `next.config.js` redirects

Add to `redirects()` function. Verify Next 16 syntax during implementation; if `has: [{ type: "host" }]` doesn't work, fall back to `{ type: "header", key: "host" }`.

```js
async redirects() {
  return [
    // BOS admin paths: awknranch.com/spaces/admin/* → team.awknranch.com/spaces/admin/*
    {
      source: "/spaces/admin/:path*",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com/spaces/admin/:path*",
      permanent: true,
    },
    // www variant
    {
      source: "/spaces/admin/:path*",
      has: [{ type: "host", value: "www.awknranch.com" }],
      destination: "https://team.awknranch.com/spaces/admin/:path*",
      permanent: true,
    },
    // Portal paths: awknranch.com/portal → team.awknranch.com (root)
    {
      source: "/portal",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com",
      permanent: true,
    },
    {
      source: "/portal/team-chart",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com/team-chart",
      permanent: true,
    },
    // Auth flow: /login* and /admin/email-* on awknranch → team
    {
      source: "/login/:path*",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com/login/:path*",
      permanent: true,
    },
    {
      source: "/login",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com/login",
      permanent: true,
    },
    {
      source: "/admin/email-:variant",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com/admin/email-:variant",
      permanent: true,
    },
    {
      source: "/logged-in",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com/logged-in",
      permanent: true,
    },
    // /api/* paths: NO redirect for /api/webhooks/* (vendor URLs registered against awknranch)
    // For non-webhook /api/team/*, redirect:
    {
      source: "/api/team/:path*",
      has: [{ type: "host", value: "awknranch.com" }],
      destination: "https://team.awknranch.com/api/team/:path*",
      permanent: true,
    },
  ];
}
```

#### Webhook URL strategy (CRITICAL — preserves Stripe/SignWell/Resend integrations)

**Don't redirect `/api/webhooks/*` paths.** Vendor-side webhook URLs (in Stripe Dashboard, SignWell Dashboard, Resend Dashboard) are registered against `https://awknranch.com/api/webhooks/...` (or wherever the legacy Supabase edge functions are — most webhooks today go directly to `https://lnqxarwqckpmirpmixcw.supabase.co/functions/v1/<name>` which is unaffected by our domain work).

For Vercel-served webhook routes (if any are added later), keep them on `awknranch.com` host so vendor configurations don't need updating. Document this constraint in `awkn-web-app/src/app/api/webhooks/CLAUDE.md` (create if missing).

#### Pre-deploy checklist

```markdown
- [ ] All commits 6a.1–6a.8 on miceli, all verifications passed locally
- [ ] `npm run build` succeeds (no TypeScript errors in src; pre-existing public/ JS errors OK)
- [ ] `npm run typecheck` clean (excluding public/)
- [ ] `team.awknranch.com` resolves via `dig +short team.awknranch.com`
- [ ] TLS cert valid: `curl -v https://team.awknranch.com/ 2>&1 | grep "SSL certificate verify ok"`
- [ ] Vercel env vars set: `vercel env ls` shows all of NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_PASSWORD
- [ ] **NEXT_PUBLIC_DISABLE_AUTH NOT set in Vercel production** (would bypass team subdomain auth)
- [ ] Push miceli to origin/miceli, open PR `miceli` → `main`
- [ ] Vercel preview deployment succeeds
- [ ] On preview URL: smoke-test the 5 representative team-subdomain pages (spaces/admin/dashboard, crm, clients, within-schedule, users)
- [ ] Operator comms doc reviewed by stakeholders (see `docs/runbooks/2026-05-08-team-subdomain-cutover.md`)
- [ ] Coordinate cutover timing — no active operator sessions during merge
```

#### Operator comms doc (NEW — `docs/runbooks/2026-05-08-team-subdomain-cutover.md`)

```markdown
# Team Subdomain Cutover — Operator Runbook

## What's changing

Starting [DATE], the AWKN BOS lives at `team.awknranch.com` instead of `awknranch.com/spaces/admin/...`.

## What you need to do

1. **Hard-refresh once after cutover:** Cmd+Shift+R (Mac) or Ctrl+Shift+R (Windows) on any cached AWKN page
2. **Re-login on the new hostname:** Old `awknranch.com` URLs will 301-redirect to the new `team.awknranch.com`. You'll be prompted to sign in once on the new host.
3. **Update bookmarks:** Replace `awknranch.com/spaces/admin/...` with `team.awknranch.com/spaces/admin/...` (or click the redirected URL once and re-bookmark)
4. **Optional: clear old localStorage on awknranch.com** if you see stale auth state. Open DevTools → Application → Local Storage → `https://awknranch.com` → delete `awkn-ranch-auth`

## What's NOT changing

- Public AWKN Ranch site (`awknranch.com`) stays on awknranch
- Within Center site (`within.center`) unaffected
- Stripe / SignWell / email vendors keep using awknranch.com webhook URLs
- All your data, customers, proposals, invoices — nothing moves, just the URL

## If something breaks

Contact Miceli. Quick rollback available — revert takes ~5 minutes via `scripts/rollback-6a-stack.sh`.
```

#### Rollback script (NEW — `scripts/rollback-6a-stack.sh`)

```bash
#!/bin/bash
# Emergency rollback for Phase 6a deploy stack (commits 6a.5-6a.8).
# Reverts in correct order to avoid 404 loops.
#
# Usage: ./scripts/rollback-6a-stack.sh
#
# Reversal order: 6a.8 → 6a.7 → 6a.6 → 6a.5
# This sequence ensures redirects come down BEFORE routes return to awknranch.

set -e

echo "Phase 6a rollback — confirm you want to revert the deploy stack."
echo "This will:"
echo "  1. Revert 6a.8 (next.config.js redirects + deploy prep)"
echo "  2. Revert 6a.7 (BOS routes back to awknranch)"
echo "  3. Revert 6a.6 (team portal routes back to awknranch)"
echo "  4. Revert 6a.5 (auth routes back to awknranch)"
echo ""
read -p "Type 'rollback' to proceed: " confirm
if [ "$confirm" != "rollback" ]; then
  echo "Aborted."
  exit 1
fi

# Find the 4 commit SHAs by looking for the conventional-commit subjects
SHA_8=$(git log --format=%H --grep="^chore(deploy): phase 6a.8" -1)
SHA_7=$(git log --format=%H --grep="^refactor: phase 6a.7" -1)
SHA_6=$(git log --format=%H --grep="^refactor: phase 6a.6" -1)
SHA_5=$(git log --format=%H --grep="^refactor: phase 6a.5" -1)

if [ -z "$SHA_8" ] || [ -z "$SHA_7" ] || [ -z "$SHA_6" ] || [ -z "$SHA_5" ]; then
  echo "ERROR: Couldn't find all 4 commits by subject pattern. Manual revert needed."
  exit 1
fi

echo "Reverting in order: $SHA_8 → $SHA_7 → $SHA_6 → $SHA_5"
git revert --no-edit "$SHA_8"
git revert --no-edit "$SHA_7"
git revert --no-edit "$SHA_6"
git revert --no-edit "$SHA_5"

echo ""
echo "Rollback commits created. Push to deploy."
echo "Note: DNS + Vercel domain config + Cloudflare CNAME still in place."
echo "If full DNS rollback needed: also remove team.awknranch.com from Vercel project + delete Cloudflare CNAME."
```

#### Cutover sequence (out of code-scope; user does this)

1. Push miceli to origin/miceli (force-with-lease if needed)
2. Open PR `miceli` → `main`
3. Wait for Vercel preview deployment + manual smoke test on preview URL
4. Coordinate timing — no active operator sessions
5. Merge PR
6. Vercel auto-deploys main to prod
7. **Within 30 min:** monitor Vercel function logs for 5xx errors, watch for operator complaints
8. If anything breaks: run `./scripts/rollback-6a-stack.sh`, push, Vercel re-deploys

#### Rollback for 6a.8 alone (rare)

If only 6a.8 needs revert (redirects buggy, routes still on team) — `git revert <6a.8>` is safe. Just removes redirect rules; routes already on team work fine, only legacy bookmarks 404.

### 6a.9 — Update STATUS.md, TODO.md, memory

**Prerequisite:** 6a.8 deployed to prod.

**Scope:**

#### STATUS.md updates
- Phase 6a marked complete
- Production deploy date noted
- Add row: "Team subdomain | ✅ Live | team.awknranch.com — auth-gated, BOS Admin + Auth + Team Portal all moved"
- Update phase phase indicator: Phase 6 in progress (6a complete, 6b not started)

#### TODO.md updates
- Close all 6a items
- Add 6b backlog: page-by-page React rebuilds, persistent audit log table, browser-side `signwell-service.js` cleanup
- Document the SignWell webhook E2E test as 6a.9-pending

#### Memory updates
- Update `project_integrations-status.md`: SignWell webhook deployed + tested in prod (or pending 6a.9 test)
- Add new memory `project_team-subdomain-live.md`: cutover date, what learnings emerged, any gotchas for future work

#### Docs work
- Add `docs/superpowers/work/2026-05-08-phase-6a-completion.md` summarizing what shipped

#### SignWell webhook E2E test (deferred from 6a.5 deploy)

Now that team subdomain is live and BOS UI is accessible at `team.awknranch.com/spaces/admin/crm`, run the test:

1. Operator opens BOS → CRM
2. Creates test proposal targeting `mmicel583@gmail.com` (clearly marked TEST)
3. Clicks Send Proposal → SignWell emails Miceli
4. Miceli signs from inbox
5. Webhook fires (already deployed with `verify_jwt: false` + env-key fix from earlier today)
6. Verify proposal status auto-flips to "signed" in DB
7. Cleanup: delete the test proposal

#### Rollback

Pure docs. No rollback needed.

---

## Verification matrix (consolidated)

After each phase commit, run the relevant subset:

```bash
# 6a.1 — M2 sweep
grep -rE 'eyJ[A-Za-z0-9_-]{20,}' spaces/admin/ awkn-web-app/public/spaces/admin/ | grep -v supabase.js
# Expected: 0 hits

# 6a.2 — M3 endpoints (after dev server restart)
# (full happy-path + 401 + 403 + 400 verification per §6a.2)

# 6a.3 — Auth gate (NEXT_PUBLIC_DISABLE_AUTH=false, restart dev server)
# (gated paths 307, auth-flow 200, traversal rejected)

# 6a.4 — Associates retired
for p in /associates /associates/projects /associates/projectinquiry /associates/worktracking; do
  curl -s -o /dev/null -w "%{http_code}  Host: awknranch.localhost  ${p}\n" -H "Host: awknranch.localhost" "http://localhost:3000${p}"
done

# 6a.5 — Auth on team
for p in /login /login/reset-password /login/update-password /admin/email-approved /admin/email-confirm; do
  curl -s -o /dev/null -w "%{http_code}  team.localhost  ${p}\n" -H "Host: team.localhost" "http://localhost:3000${p}"
  curl -s -o /dev/null -w "%{http_code}  awknranch.localhost  ${p}  (should 404)\n" -H "Host: awknranch.localhost" "http://localhost:3000${p}"
done

# 6a.6 — Team portal + logged-in on team
for p in / /team-chart /logged-in; do
  curl -s -o /dev/null -w "%{http_code}  team.localhost  ${p}\n" -H "Host: team.localhost" "http://localhost:3000${p}"
done

# 6a.7 — BOS on team (39-route loop in §6a.7)

# 6a.8 — Pre-deploy checklist (§6a.8)
```

---

## What ships in Phase 6a (final summary)

- **47 route moves** (5 auth + 3 team portal + 39 BOS admin) → team subdomain
- **4 route deletions** (associates) + legacy source + public mirrors
- **Auth gate** with path-traversal rejection + method restriction + auth-flow allowlist
- **M2** — 12 hardcoded JWTs eliminated (legacy + public mirror)
- **M3** — 5 highest-risk operations now run server-side with bearer-token auth + Origin allowlist + Zod validation + role-matrix enforcement + structured audit logs
- **`team/robots.txt`** — Disallow: / (admin pages won't be indexed)
- **`next.config.js` 301 redirects** with proper host scoping (awknranch.com + www) and webhook-path exclusion
- **Vercel deploy stack** — 6a.5–6a.8 ship together via single Vercel preview + main merge
- **Operator runbook** — `docs/runbooks/2026-05-08-team-subdomain-cutover.md`
- **Rollback script** — `scripts/rollback-6a-stack.sh` for emergency revert
- **STATUS / TODO / memory** updated to reflect new state

## What's deferred to Phase 6b+ (long-game refactor)

- React rebuild of any BOS page (page-by-page on `phase-6b-react-rebuild` branch, no time pressure)
- Persistent audit log table for M3 mutations (currently structured console.log via Vercel logs)
- HttpOnly-cookie session migration (currently bearer-token via legacy localStorage)
- Within Center port changes
- Within Supabase consolidation
- Public AWKN Ranch page Reactification (no forcing function)
- M1 (shared sidebar/header layout for BOS) — defer until React rebuilds start
- Browser-side `signwell-service.js` + `templates.js` UI cleanup (read missing `signwell_config` table — deletable)
- 6 prod edge functions to undeploy at end-of-program cutover (`vapi-server`, `property-ai`, `generate-whispers`, `nest-control`, `tesla-command`, `guestbook-upload`)
- Mirror-sync automation (currently a 5-line bash script — formalize when frequency justifies)

---

## Implementation playbook (for future Claude session pickup)

Each phase commit is self-contained. To resume mid-implementation:

1. Read this spec
2. Read `STATUS.md` — surfaces current phase
3. Run `git log --oneline -15` — see what's already committed
4. Identify next pending phase
5. Follow per-phase deliverables, verification, rollback

#### Deploy gate rules

- **6a.1, 6a.2, 6a.3, 6a.4** — independent, each can ship to prod alone after merging miceli to main
- **6a.5–6a.8** — ship together as the deploy stack. Never merge to main with a partial stack. Vercel preview deployments are the integration test.
- **6a.9** — docs only, ships anytime after the stack lands

#### If you find a bug mid-phase

- Bug in current phase: fix in same commit before pushing
- Bug in earlier phase: separate fix commit, document in commit message which earlier phase it patches
- Phase ordering issue: stop, audit the spec, surface to user before continuing

#### If a verification fails

- Stop. Don't proceed to next phase.
- Read STATUS for context.
- Re-read the failing verification step in this spec.
- Surface to user with: what failed, what you've tried, what you suspect.

---

## Audit log

| Date | Reviewer | Summary |
|---|---|---|
| 2026-05-06 | Claude self-review (v1) | Initial draft, 9 phases, 12-risk register |
| 2026-05-06 | OpenAI Codex (codex-cli 0.55, default model) | 30 issues identified: 4 CRITICAL, 23 MAJOR, 3 MINOR. See raw audit at `docs/superpowers/work/2026-05-06-phase-6a-codex-audit.md` |
| 2026-05-06 | Claude (v2 incorporation) | Plan revised to address all 30 issues. Notable rejections: Codex #6 (params signature) — Codex was incorrect; Next 16 uses Promise<params> per official docs. All other issues incorporated. Risk register expanded from 12 → 28 entries. New: deploy stack concept, server-side session via bearer tokens, CSRF immunity via no-cookie design, role matrix, Zod validation, Origin allowlist, path-traversal-resistant auth gate, robots.txt, operator runbook, rollback script. |

---

*End of spec v2. Implementation can begin.*
