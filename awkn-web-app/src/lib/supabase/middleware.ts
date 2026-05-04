import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "~/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing any logic between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  let user = null;

  try {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    user = authUser;
  } catch (error) {
    // Handle stale/invalid refresh tokens gracefully
    if (error && typeof error === "object" && "code" in error) {
      const authError = error as { code?: string; message?: string };

      if (
        authError.code === "refresh_token_already_used" ||
        authError.code === "invalid_grant"
      ) {
        // Clear the stale cookies by signing out
        await supabase.auth.signOut();

        if (process.env.NODE_ENV === "development") {
          console.warn(
            "[Auth] Cleared stale auth cookies - user will need to re-login"
          );
        }
      } else {
        // Log other auth errors
        console.error("[Auth] Session error:", authError.code, authError.message);
      }
    }
  }

  return { supabaseResponse, user };
}
