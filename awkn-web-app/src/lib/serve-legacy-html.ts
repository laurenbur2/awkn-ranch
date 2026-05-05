import fs from "node:fs";
import path from "node:path";

/**
 * Reads a legacy static HTML page (under the repo root, outside awkn-web-app)
 * and returns it as an HTTP Response. Used by Route Handlers under
 * `app/awknranch/(internal)/...` to serve standalone pitch/internal pages
 * (investor decks, operations logistics) verbatim — they bring their own
 * fonts and styles and don't share chrome with the rest of the app, so
 * full-document delivery preserves 1:1 visual parity without re-templating.
 */
export function serveLegacyHtml(legacyRelativePath: string): Response {
  const fullPath = path.join(process.cwd(), "..", legacyRelativePath);
  const html = fs.readFileSync(fullPath, "utf-8");
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
