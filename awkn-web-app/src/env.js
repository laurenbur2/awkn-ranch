import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side env.
   *
   * Either set `SUPABASE_DB_PASSWORD` and let us compose the URL, OR set
   * `DATABASE_URL` directly (overrides the composed URL). The composed URL
   * targets the session pooler so it works for both `drizzle-kit pull`
   * introspection and runtime queries.
   *
   * `SUPABASE_SERVICE_ROLE_KEY` becomes required from Phase 2.4 onward
   * (server-side admin operations); optional during scaffold.
   */
  server: {
    SUPABASE_DB_PASSWORD: z.string().min(1).optional(),
    DATABASE_URL: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Client-side env. URL + anon key are required because the Supabase client
   * boots from them on render. NEXT_PUBLIC_DISABLE_AUTH is the dev-mode
   * bypass — when "true", middleware skips auth checks on protected domains.
   */
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_DISABLE_AUTH: z.enum(["true", "false"]).default("false"),
  },

  runtimeEnv: {
    SUPABASE_DB_PASSWORD: process.env.SUPABASE_DB_PASSWORD,
    DATABASE_URL: process.env.DATABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_DISABLE_AUTH: process.env.NEXT_PUBLIC_DISABLE_AUTH,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
