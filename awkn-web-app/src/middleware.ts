import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveDomain } from "~/lib/domains";
import { updateSession } from "~/lib/supabase/middleware";

/**
 * Multi-domain + auth middleware.
 *
 * 1. Reads `host` header → maps to a domain (awknranch / within / portal / bos)
 *    via `resolveDomain`. Rewrites incoming path to `/<key>{pathname}` so the
 *    right route folder renders.
 * 2. For domains marked `authRequired`, checks Supabase session and redirects
 *    to `/login` (under the same domain) if unauthenticated.
 * 3. `NEXT_PUBLIC_DISABLE_AUTH=true` short-circuits the auth check — useful
 *    during dev/testing before real auth is wired.
 */
export async function middleware(request: NextRequest) {
  const host = request.headers.get("host");
  const domain = resolveDomain(host);
  const authDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

  // No matched domain → bare `localhost`, IP access, etc. Show the dev landing.
  if (!domain) return NextResponse.next({ request });

  const { pathname, search } = request.nextUrl;

  // Already-rewritten paths shouldn't be rewritten again. Pass through if
  // the URL already starts with the domain prefix.
  const prefix = `/${domain.key}`;
  if (pathname.startsWith(prefix)) return NextResponse.next({ request });

  // Auth gate (skipped when NEXT_PUBLIC_DISABLE_AUTH=true)
  if (domain.authRequired && !authDisabled) {
    const session = await updateSession(request);
    if (!session.user) {
      const loginUrl = new URL(`${prefix}/login`, request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Rewrite `awknranch.com/about` → `/awknranch/about` internally
  const rewriteUrl = new URL(`${prefix}${pathname}${search}`, request.url);
  return NextResponse.rewrite(rewriteUrl);
}

export const config = {
  matcher: [
    // Run on all paths EXCEPT static assets and Next.js internals
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
