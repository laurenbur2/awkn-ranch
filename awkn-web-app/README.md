# awkn-web-app

Multi-domain Next.js app for AWKN Ranch and Within Center

## Getting Started

1. Copy `.env.example` to `.env` and configure:
   - Create Supabase project at https://supabase.com
   - Add DATABASE_URL
   - Add Supabase keys

2. Install dependencies:
   ```bash
   npm install
   ```

3. Push database schema:
   ```bash
   npm run db:push
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## Tech Stack

- **Next.js 16** + React 19 + TypeScript
- **tRPC 11** + TanStack Query
- **Drizzle ORM** + Supabase PostgreSQL
- **Tailwind CSS 4** + shadcn/ui
- **Supabase Auth**

## Project Structure

```
src/
├── app/              # Next.js pages
├── components/       # React components
│   └── ui/          # shadcn/ui components
├── lib/             # Utilities
├── server/
│   ├── api/         # tRPC routers
│   └── db/          # Database schema
└── trpc/            # tRPC client setup
```

## Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant context
- [STATUS.md](./STATUS.md) - Feature status
- [TODO.md](./TODO.md) - Work tracking
