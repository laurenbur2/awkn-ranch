import { config } from "dotenv";
import { type Config } from "drizzle-kit";

import { resolveDbUrlFromEnv } from "~/lib/db-url";

// drizzle-kit doesn't auto-load .env.local the way Next.js does
config({ path: ".env.local" });

/**
 * Reads from process.env directly (bypassing the t3 env validator which
 * requires client-side NEXT_PUBLIC_* vars to be present — they aren't, in
 * the drizzle-kit tooling context).
 */
const dbUrl = resolveDbUrlFromEnv({
  DATABASE_URL: process.env.DATABASE_URL,
  SUPABASE_DB_PASSWORD: process.env.SUPABASE_DB_PASSWORD,
});

export default {
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: dbUrl },
  verbose: true,
  strict: true,
} satisfies Config;
