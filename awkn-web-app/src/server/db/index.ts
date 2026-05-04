import "server-only";

import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "~/env";
import { resolveDbUrlFromEnv } from "~/lib/db-url";
import * as schema from "./schema";

/**
 * Database client (Postgres / Supabase via Drizzle).
 *
 * Created lazily — the connection isn't opened until the first query, so
 * pages that don't touch the DB (Phase 2.1/2.2 stubs) don't pay the cost
 * and don't crash if the password isn't set yet.
 */

type PgClient = ReturnType<typeof postgres>;
type DrizzleClient = ReturnType<typeof drizzlePg<typeof schema>>;

const globalForDb = globalThis as unknown as {
  conn: PgClient | undefined;
  drizzleClient: DrizzleClient | undefined;
};

function createDrizzleClient(): DrizzleClient {
  const url = resolveDbUrlFromEnv({
    DATABASE_URL: env.DATABASE_URL,
    SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD,
  });
  const conn =
    globalForDb.conn ??
    postgres(url, {
      prepare: false,
    });
  if (env.NODE_ENV !== "production") globalForDb.conn = conn;
  return drizzlePg(conn, { schema });
}

/**
 * Lazy proxy — first property access on `db` triggers the connection.
 * Stub pages that never touch `db` won't open a Postgres connection.
 */
export const db = new Proxy({} as DrizzleClient, {
  get(_target, prop, receiver) {
    if (!globalForDb.drizzleClient) {
      globalForDb.drizzleClient = createDrizzleClient();
    }
    return Reflect.get(globalForDb.drizzleClient, prop, receiver);
  },
});
