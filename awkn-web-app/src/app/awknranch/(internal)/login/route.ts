import fs from "node:fs";
import path from "node:path";

/**
 * Functional port of the legacy AWKN team-portal sign-in.
 *
 * Serves the legacy HTML verbatim, but with two surgical patches:
 *
 *   1. Rewrites `src="app.js"` → `src="/login/app.js"` so the relative
 *      path resolves correctly from the new app's URL `/login` (which has
 *      no trailing slash, so the browser would otherwise resolve `app.js`
 *      against `/`, not `/login/`).
 *
 *   2. Injects an inline <script> into <head> that primes
 *      sessionStorage['awkn-ranch-login-redirect'] = '/logged-in'. The
 *      legacy app.js falls back to that key when no `?redirect=` URL
 *      param is present — without this, the default fallback target
 *      (`/awkn-ranch/spaces/admin/reservations.html?pillar=master`) sends
 *      the user to a 404 in the new app.
 *
 * The legacy supabase.js (now served from /shared/supabase.js) uses
 * localStorage with storageKey: 'awkn-ranch-auth'. The /team page reads
 * the same key — so a successful sign-in here is automatically visible
 * to /team without further bridging.
 */
export function GET() {
  const fullPath = path.join(process.cwd(), "..", "login/index.html");
  let html = fs.readFileSync(fullPath, "utf-8");

  html = html.replaceAll('src="app.js"', 'src="/login/app.js"');

  html = html.replace(
    "</head>",
    `<script>try{sessionStorage.setItem('awkn-ranch-login-redirect','/logged-in');}catch(e){}</script>\n</head>`,
  );

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
