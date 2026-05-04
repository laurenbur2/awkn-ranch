/**
 * DB URL composition — shared between Next.js runtime and drizzle-kit tooling.
 *
 * Two entry points:
 *   - `composeDbUrl(password)` — pure helper. Constructs the session-pooler
 *     URL from a raw password. URL-encodes special characters.
 *   - `resolveDbUrlFromEnv(env)` — convenience for runtime callers; takes
 *     either an explicit DATABASE_URL (verbatim, wins) or composes from
 *     SUPABASE_DB_PASSWORD.
 *
 * NOTE: this file deliberately does NOT import `~/env` (the t3-style
 * validator). drizzle.config.ts is loaded outside Next.js so the client-side
 * env vars (`NEXT_PUBLIC_*`) aren't available, which would make t3 validation
 * fail. Build tooling reads `process.env` directly via this helper instead.
 *
 * Why session pooler (port 5432): supports prepared statements, which
 * drizzle-kit pull needs for introspection. Also fine at runtime when
 * `postgres()` is called with `prepare: false`.
 */

const PROJECT_REF = "lnqxarwqckpmirpmixcw";
const POOLER_HOST = "aws-0-us-west-2.pooler.supabase.com";
const POOLER_PORT = 5432;

export function composeDbUrl(password: string): string {
  const encoded = encodeURIComponent(password);
  return `postgresql://postgres.${PROJECT_REF}:${encoded}@${POOLER_HOST}:${POOLER_PORT}/postgres?sslmode=require`;
}

export interface DbUrlSource {
  DATABASE_URL?: string | undefined;
  SUPABASE_DB_PASSWORD?: string | undefined;
}

export function resolveDbUrlFromEnv(source: DbUrlSource): string {
  if (source.DATABASE_URL && !source.DATABASE_URL.includes("placeholder")) {
    return source.DATABASE_URL;
  }
  if (!source.SUPABASE_DB_PASSWORD) {
    throw new Error(
      "Database not configured. Set SUPABASE_DB_PASSWORD (recommended) or " +
        "DATABASE_URL in .env.local. See .env.example for details.",
    );
  }
  return composeDbUrl(source.SUPABASE_DB_PASSWORD);
}
