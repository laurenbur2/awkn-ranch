import "server-only";

// PostgreSQL imports
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// SQLite imports
import { drizzle as drizzleSqlite } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";

import { env } from "~/env";
import * as schema from "./schema";

/**
 * Database client configuration
 *
 * Automatically detects and uses the appropriate database driver based on DATABASE_URL:
 * - PostgreSQL/Supabase: URLs starting with "postgresql://"
 * - SQLite/LibSQL: URLs starting with "file:" or "libsql://"
 */

// Detect database type from URL
const isPostgres = env.DATABASE_URL.startsWith("postgresql://");

function createDatabase() {
  if (isPostgres) {
    // PostgreSQL/Supabase configuration
    const globalForDb = globalThis as unknown as {
      conn: ReturnType<typeof postgres> | undefined;
    };

    const conn =
      globalForDb.conn ??
      postgres(env.DATABASE_URL, {
        prepare: false,
      });
    if (env.NODE_ENV !== "production") globalForDb.conn = conn;

    return drizzlePg(conn, { schema });
  } else {
    // SQLite/LibSQL configuration
    const globalForDb = globalThis as unknown as {
      conn: ReturnType<typeof createClient> | undefined;
    };

    const conn =
      globalForDb.conn ??
      createClient({
        url: env.DATABASE_URL,
      });
    if (env.NODE_ENV !== "production") globalForDb.conn = conn;

    return drizzleSqlite(conn, { schema });
  }
}

export const db = createDatabase() as any;
