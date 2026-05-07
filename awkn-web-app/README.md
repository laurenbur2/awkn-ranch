# awkn-web-app

Multi-domain Next.js app for **AWKN Ranch** (wellness retreat in Austin) and **Within Center** (clinical brand for ceremonial ketamine therapy). Single codebase, four hostname spaces:

- `awknranch.com` — AWKN Ranch public site
- `team.awknranch.com` — team operating system (BOS), auth-gated
- `within.center` — Within Center clinical site
- `portal.awknranch.com` — client portal (greenfield)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure env
cp .env.example .env.local
# Fill in values — see .env.example for vault locations per service

# 3. (Optional) Sync legacy content from upstream
./scripts/sync-legacy.sh /path/to/legacy/repo/root

# 4. Start dev server
npm run dev
```

Then visit:

- `http://awknranch.localhost:3000/` — AWKN Ranch site
- `http://team.localhost:3000/` — team subdomain (sign-in landing)
- `http://within.localhost:3000/` — Within Center site
- `http://portal.localhost:3000/` — client portal stub
- `http://localhost:3000/` — dev landing (port progress + cross-domain links)

`*.localhost` resolves to `127.0.0.1` automatically on macOS — no DNS setup needed.

## Tech stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Supabase** PostgreSQL via Drizzle ORM (72 tables introspected from prod)
- **Supabase Auth** — `@supabase/ssr` cookies for new app + legacy localStorage bridge for ported pages
- **Tailwind CSS 4** + shadcn/ui
- **Vercel** for hosting (post-cutover)

## Project structure

```
src/
├── app/
│   ├── awknranch/(internal)/     ← awknranch.com routes (public marketing)
│   ├── within/(internal)/        ← within.center routes
│   ├── team/(internal)/          ← team.awknranch.com (auth-gated BOS)
│   ├── portal/                   ← client portal scaffold
│   ├── api/team/                 ← M3 server-side gated endpoints
│   └── page.tsx                  ← dev landing (port-status manifest)
├── proxy.ts                       ← Multi-domain hostname routing + auth gate
├── lib/
│   ├── serve-legacy-html.ts       ← Verbatim legacy HTML serving
│   ├── api-auth.ts                ← M3 bearer-token + Origin validation
│   ├── domains.ts                 ← Domain → route-folder mapping
│   └── port-status.ts             ← Manifest of all 110 ported pages
├── server/
│   └── db/schema.ts               ← Drizzle schema (introspected)
└── components/ui/                 ← shadcn/ui components

legacy/                            ← Bundled legacy HTML/JS (read at runtime)
public/                            ← Static assets (mirrors of legacy assets/)
scripts/
├── sync-legacy.sh                 ← Sync legacy/ from upstream legacy repo
└── sync-bos-mirror.sh             ← Sync legacy admin JS into public/
```

## Key concepts

### Multi-domain routing

`src/proxy.ts` reads the `Host` header, maps to a `DomainKey` via `src/lib/domains.ts`, and rewrites the path internally to `/<domain>/<rest>`. Browser URLs stay clean. See [CLAUDE.md](./CLAUDE.md) for the routing convention.

### Legacy passthrough

Most pages are **verbatim ports** of legacy GitHub Pages HTML. `serveLegacyHtml()` reads from `legacy/` (bundled inside this repo) and returns the HTML as a `text/html` Response. This preserves direct-HTML-edit workflow for content authors.

When upstream legacy content updates, sync via:
```bash
./scripts/sync-legacy.sh /path/to/legacy-repo
git add legacy/ && git commit -m "chore(legacy): sync from upstream"
```

### M3 server-side write gates

Highest-risk operator writes (role change, user delete, payment-link creation, lead delete) route through `/api/team/*` with bearer-token auth + Origin allowlist + Zod validation + role matrix + structured audit logs. See `src/lib/api-auth.ts` for the helper layer.

## Documentation

- **[STATUS.md](./STATUS.md)** — current state, port catalog, recent changes
- **[TODO.md](./TODO.md)** — open work, organized by priority
- **[ROADMAP.md](./ROADMAP.md)** — two-track roadmap: features + refactoring
- **[CLAUDE.md](./CLAUDE.md)** — project directives + code conventions for AI-assisted development
- **[.env.example](./.env.example)** — env-var inventory mapped to vault locations
- **[docs/superpowers/specs/](./docs/superpowers/specs/)** — phase specs + design docs

## License

Private / unlicensed — see [LICENSE](./LICENSE).
