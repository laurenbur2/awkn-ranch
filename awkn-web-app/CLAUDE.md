# awkn-web-app

## Overview
Multi-domain Next.js app for AWKN Ranch and Within Center

## Quick Commands
```bash
npm run dev              # Start dev server
npm run build            # Build for production
npm run typecheck        # Type check
npm run db:push          # Push schema to database
npm run db:studio        # Open Drizzle Studio
```

## Tech Stack
- **Framework**: Next.js 16, React 19, TypeScript
- **Database**: Supabase PostgreSQL via Drizzle ORM
- **Auth**: Supabase Auth
- **API**: tRPC with TanStack Query
- **Styling**: Tailwind CSS 4 + shadcn/ui

## Key Paths
| Path | Purpose |
|------|---------|
| src/app/ | Next.js App Router pages |
| src/server/api/routers/ | tRPC routers |
| src/server/db/schema.ts | Database schema |
| src/lib/ | Utility functions |
| src/components/ui/ | shadcn/ui components |

## Current Status
See STATUS.md for feature status and TODO.md for tracked work.
