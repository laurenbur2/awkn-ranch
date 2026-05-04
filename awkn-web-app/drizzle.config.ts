import { type Config } from "drizzle-kit";

import { env } from "~/env";

// Detect database type from URL
const isPostgres = env.DATABASE_URL.startsWith("postgresql://");

export default {
  schema: "./src/server/db/schema.ts",
  dialect: isPostgres ? "postgresql" : "sqlite",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: ["awkn-web-app_*"],
  verbose: true,
  strict: true,
} satisfies Config;
