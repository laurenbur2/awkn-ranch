import { serveLegacyHtml } from "~/lib/serve-legacy-html";

// Verbatim port of the legacy AWKN team-portal sign-in. Reference asset
// only — the page's `app.js` and `shared/*.js` modules don't ship with the
// new app, so form submission won't actually authenticate. Layout, fonts,
// and styling render correctly.
export function GET() {
  return serveLegacyHtml("login/index.html");
}
