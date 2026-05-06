import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resolveDomain } from "~/lib/domains";
import { updateSession } from "~/lib/supabase/middleware";

/**
 * Multi-domain + auth proxy (Next 16 successor to `middleware.ts`).
 *
 * 1. Reads `host` header → maps to a domain (awknranch / within / portal / team)
 *    via `resolveDomain`. Rewrites incoming path to `/<key>{pathname}` so the
 *    right route folder renders.
 * 2. For domains marked `authRequired`, checks Supabase session and redirects
 *    to `/login` (under the same domain) if unauthenticated.
 * 3. `NEXT_PUBLIC_DISABLE_AUTH=true` short-circuits the auth check — useful
 *    during dev/testing before real auth is wired.
 */
export async function proxy(request: NextRequest) {
  const host = request.headers.get("host");
  const domain = resolveDomain(host);
  const authDisabled = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

  // No matched domain → bare `localhost`, IP access, etc. Show the dev landing.
  if (!domain) return NextResponse.next({ request });

  let { pathname } = request.nextUrl;
  const { search } = request.nextUrl;

  // Already-rewritten paths shouldn't be rewritten again. We mark internal
  // rewrites with `x-proxy-rewritten` so we can distinguish between a
  // user-supplied path like `/within` (which legitimately exists as a route
  // under the within domain) and a path we already rewrote in a prior pass.
  // Path-prefix detection breaks for the legitimate-collision case.
  const prefix = `/${domain.key}`;
  if (request.headers.get("x-proxy-rewritten")) {
    return NextResponse.next({ request });
  }

  // Normalize legacy URL shapes so verbatim-ported HTML/JS in `legacy-html/`
  // and `public/shared/` keeps working without per-file source edits:
  //  - `/awkn-ranch/X` (legacy GH-Pages base path) → `/X`. Hardcoded in
  //    the legacy `auth.js`, `version-info.js`, `instant-chrome.js`, etc.
  //    for fetches and `window.location.href` redirects.
  //  - `/X.html` → `/X`. Legacy admin nav links to `dashboard.html` etc.;
  //    new-app route handlers are extension-less.
  //  - Trailing slash on non-root paths → stripped (`/login/` → `/login`).
  // All three are Phase-6-throwaway — they disappear naturally as each
  // admin page gets re-scaffolded in React and the legacy JS gets deleted.
  if (pathname.startsWith("/awkn-ranch/")) {
    pathname = pathname.slice("/awkn-ranch".length);
  }
  if (pathname.endsWith(".html")) {
    pathname = pathname.slice(0, -".html".length);
  }
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  // Auth gate (skipped when NEXT_PUBLIC_DISABLE_AUTH=true)
  if (domain.authRequired && !authDisabled) {
    const session = await updateSession(request);
    if (!session.user && pathname !== "/login") {
      // Redirect to the clean public `/login` URL — proxy will rewrite it
      // to `/${prefix}/login` on the way in. Stay on the same hostname so
      // the URL bar shows e.g. `team.awknranch.com/login`, not `/team/login`.
      const loginUrl = new URL("/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Rewrite `awknranch.com/about` → `/awknranch/about` internally.
  // Mark with `x-proxy-rewritten` so a subsequent middleware pass (if any)
  // skips re-rewriting.
  const rewriteUrl = new URL(`${prefix}${pathname}${search}`, request.url);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-proxy-rewritten", "1");
  return NextResponse.rewrite(rewriteUrl, {
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    // Run on all paths EXCEPT static assets and Next.js internals
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
