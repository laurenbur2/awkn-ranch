import "server-only";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "~/env";
import { db } from "~/server/db";
import { appUsers } from "~/server/db/schema";

/**
 * Server-side helper for getting the current authenticated user joined with
 * the AWKN-specific `app_users` row (which carries role + permissions).
 *
 * Usage:
 *   const user = await getCurrentUser();
 *   if (!user) redirect("/login");
 *
 * Or use `requireUser()` to throw/redirect on missing.
 *
 * The legacy BOS does this same lookup client-side via shared/auth.js;
 * doing it server-side here means RLS + role gating happen before the
 * page renders.
 */
export type CurrentUser = {
  authUserId: string;
  email: string | null;
  appUser: typeof appUsers.$inferSelect | null;
  role: string;
};

async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components can't set cookies — silently ignore.
            // Real cookie setting happens in middleware/proxy.
          }
        },
      },
    },
  );
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  let appUser: typeof appUsers.$inferSelect | null = null;
  try {
    const rows = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.authUserId, authUser.id))
      .limit(1);
    appUser = rows[0] ?? null;
  } catch {
    // DB lookup failure shouldn't crash the page — auth-only fallback.
  }

  return {
    authUserId: authUser.id,
    email: authUser.email ?? null,
    appUser,
    // app_users row carries the canonical role; default 'public' for
    // authenticated users without an app_users record yet.
    role: (appUser?.role as string | undefined) ?? "public",
  };
}

export async function requireUser(loginPath: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(loginPath);
  return user;
}

export async function signOut(redirectTo: string): Promise<never> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect(redirectTo);
}
