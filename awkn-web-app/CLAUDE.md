# awkn-web-app — Project Directives

Multi-domain Next.js 16 app backing AWKN Ranch (wellness retreat in Austin) and Within Center (clinical brand for ceremonial ketamine therapy). Single codebase serves four hostname spaces with hostname-based routing.

For full project state, read **[STATUS.md](./STATUS.md)** before making changes. For open work, **[TODO.md](./TODO.md)**. For longer-term direction, **[ROADMAP.md](./ROADMAP.md)**.

## Quick Commands

```bash
npm run dev              # Start dev server (Turbopack)
npm run build            # Build for production
npm run typecheck        # Type check
npm run lint             # Lint
npm run db:push          # Push schema to database
npm run db:studio        # Open Drizzle Studio
```

## Tech Stack

- **Framework:** Next.js 16 (App Router) + React 19 + TypeScript
- **Database:** Supabase PostgreSQL via Drizzle ORM (schema introspected from prod, 72 tables)
- **Auth:** Supabase Auth — `@supabase/ssr` cookie-based for new app + legacy `localStorage[awkn-ranch-auth]` bridge for ported pages
- **API:** Server Actions / API routes for new functionality; tRPC scaffold present but unused
- **Styling:** Tailwind CSS 4 + shadcn/ui for new components; legacy ports bring their own CSS
- **Hosting:** Vercel (post-cutover); legacy site continues on GitHub Pages until DNS flip

## Key Paths

| Path | Purpose |
|------|---------|
| `src/app/` | Next.js App Router — domain folders (awknranch/within/team/portal) + api/ |
| `src/proxy.ts` | Multi-domain hostname routing + auth gate (Next 16 successor to middleware.ts) |
| `src/lib/serve-legacy-html.ts` | Verbatim legacy HTML serving + per-call rewrite modes |
| `src/lib/api-auth.ts` | Server-side bearer-token auth helpers for M3 endpoints |
| `src/lib/domains.ts` | DomainKey + hostname → route-folder mapping |
| `src/lib/port-status.ts` | Manifest of all 110 ported pages (drives dev landing) |
| `src/server/db/schema.ts` | Drizzle schema (introspected from prod) |
| `legacy/` | Bundled legacy HTML/JS read at runtime by serveLegacyHtml |
| `public/` | Static assets — mirrors of legacy `assets/`, `shared/`, `branding/`, etc. |
| `scripts/sync-legacy.sh` | Sync legacy/ from upstream legacy repo |
| `scripts/sync-bos-mirror.sh` | Sync legacy admin JS into public/ for static serving |
| `docs/superpowers/specs/` | Phase specs + design docs |

## Domain layout

Each hostname routes to a folder under `src/app/`:

| Hostname | Routes to | Auth | Purpose |
|---|---|---|---|
| `awknranch.com` (+ `awknranch.localhost`) | `src/app/awknranch/` | None | Public AWKN Ranch marketing |
| `within.center` (+ `within.localhost`) | `src/app/within/` | None | Within Center clinical site |
| `team.awknranch.com` (+ `team.localhost`) | `src/app/team/` | Required | BOS admin + auth flow |
| `portal.awknranch.com` (+ `portal.localhost`) | `src/app/portal/` | Required | Client portal (Phase 5+) |

Local dev: `*.localhost` resolves automatically on macOS — no DNS setup needed.

## Conventions

### Routing
- **Verbatim legacy ports** live under `(internal)` route group: `app/<domain>/(internal)/<path>/route.ts` calls `serveLegacyHtml('<legacyRelativePath>', { /* mode flags */ })`
- **New React pages** live under direct path: `app/<domain>/<path>/page.tsx`
- `(internal)/layout.tsx` returns bare `{children}` so Route Handlers don't render the team-level `<DomainNav>`
- All URLs are canonical with **trailing slash** (`trailingSlash: true` in `next.config.js`) — matches the legacy GH-Pages convention so relative `href="X/"` links work

### Server Actions / API routes
- M3 endpoints under `app/api/team/` enforce: Origin allowlist + bearer-token auth + Zod validation + role matrix
- See `src/lib/api-auth.ts` for the helper layer (`checkOrigin`, `validateBearer`, `getServiceRoleClient`, `auditLog`)
- New risky writes should follow the M3 pattern; client code calls them via `fetch('/api/team/...')` with `Authorization: Bearer <token>`

### Legacy passthrough
- Lauren and Justin edit legacy HTML directly — preserve this workflow. **Do NOT** Reactify a page just because it's possible.
- `serveLegacyHtml` rewrite modes: `bosPort` (BOS admin), `withinPort` (within marketing), `legacyAuthPort` (auth flow), `clinicalPort` (within EMR concept stubs)
- When Lauren/Justin push HTML changes to upstream legacy, run `./scripts/sync-legacy.sh` from inside this app to update the bundled mirror

### Branching + commits
- Strategic well-scoped commits to feature branches
- **Never merge to `main` without explicit user permission** — main is the gate to production
- Conventional commits style for messages: `feat()`, `fix()`, `chore()`, `docs()`, `refactor()`

### Database discipline
- Read-only prod via `supabase db query --linked` and `drizzle-kit pull`
- No prod DB writes during feature work — carve-outs documented per phase if a verification requires one
- Schema changes go through Supabase migrations (in upstream legacy repo's `supabase/migrations/`)

## Code patterns to follow

### Adding a new BOS admin route
```ts
// app/team/(internal)/spaces/admin/<X>/route.ts
import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("spaces/admin/<X>.html", { bosPort: true });
}
```

### Adding a new M3 server-side write
```ts
// app/api/team/<resource>/<id>/route.ts
import { z } from "zod";
import { auditLog, checkOrigin, getServiceRoleClient, jsonError, validateBearer } from "~/lib/api-auth";

const ALLOWED_ROLES = ["oracle", "admin"] as const;
const Schema = z.object({ /* fields */ });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkOrigin(req)) return jsonError("Forbidden origin", 403);
  const caller = await validateBearer(req);
  if (!caller) return jsonError("Unauthorized", 401);
  if (!(ALLOWED_ROLES as readonly string[]).includes(caller.role)) return jsonError("Insufficient role", 403);
  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return jsonError("Invalid body", 400);
  auditLog({ action: "M3.<op>", caller, target: { /* */ }, payload: body.data });
  const admin = getServiceRoleClient();
  // ... mutation
}
```

### Adding a new ported page to the manifest
Update `src/lib/port-status.ts`:
```ts
{
  label: "Display name",
  domain: "awknranch" | "within" | "team" | "portal",
  path: "/path",
  legacyPath: "/legacy/path.html",
  group: "Group Name",
  notes: "(optional)",
}
```

## What this repo does NOT contain

- The legacy GH-Pages site (`awknranch.com` legacy version) — that lives in the original `laurenbur2/awkn-ranch` repo. Lauren and Justin edit there. Sync via `scripts/sync-legacy.sh` to update the bundled mirror.
- Supabase migrations + edge functions — those live in the upstream legacy repo's `supabase/` directory. Future flows port out of edge functions into Server Actions in this app over time.
- Production secrets — `.env.local` is gitignored. See `.env.example` for the inventory.
