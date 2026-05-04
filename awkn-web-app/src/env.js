import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side env. DATABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required at
   * type-check time but only actually called during Phases 2.3+ (Drizzle pull
   * + server-side admin operations). For Phase 2.1 a placeholder DATABASE_URL
   * is fine — `db` is created lazily and never accessed by the stub pages.
   */
  server: {
    DATABASE_URL: z.string().min(1),
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
