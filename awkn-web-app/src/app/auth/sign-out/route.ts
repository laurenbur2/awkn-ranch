import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "~/env";

/**
 * Sign-out endpoint. Hit via POST (form action) or navigation. Clears the
 * Supabase session cookies and redirects to `?next=` (or domain root).
 */
export async function POST(request: Request) {
  return handleSignOut(request);
}

export async function GET(request: Request) {
  return handleSignOut(request);
}

async function handleSignOut(request: Request) {
  const cookieStore = await cookies();
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    },
  );
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL(next, request.url));
}
