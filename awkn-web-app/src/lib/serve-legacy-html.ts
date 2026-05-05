import fs from "node:fs";
import path from "node:path";

interface ServeOptions {
  /**
   * Rewrite relative `images/...` references (in HTML `src` attributes and
   * inline CSS `url()` rules) to absolute paths rooted at this base. Required
   * when the legacy page references images via relative paths and the page is
   * served at a URL without a trailing slash — without rewriting, the browser
   * resolves relative URLs against the *parent* path and 404s. Provide e.g.
   * `/investor` so the matching `public/investor/images/...` resolves.
   */
  imageBase?: string;
}

/**
 * Reads a legacy static HTML page (under the repo root, outside awkn-web-app)
 * and returns it as an HTTP Response. Used by Route Handlers under
 * `app/awknranch/(internal)/...` to serve standalone pitch/internal pages
 * (investor decks, operations logistics, reference pages) verbatim — they
 * bring their own fonts and styles and don't share chrome with the rest of
 * the app, so full-document delivery preserves 1:1 visual parity without
 * re-templating.
 */
export function serveLegacyHtml(
  legacyRelativePath: string,
  options: ServeOptions = {},
): Response {
  const fullPath = path.join(process.cwd(), "..", legacyRelativePath);
  let html = fs.readFileSync(fullPath, "utf-8");

  if (options.imageBase) {
    const base = options.imageBase.replace(/\/$/, "");
    html = html
      .replaceAll(/src="images\//g, `src="${base}/images/`)
      .replaceAll(/url\('images\//g, `url('${base}/images/`)
      .replaceAll(/url\("images\//g, `url("${base}/images/`)
      .replaceAll(/url\(images\//g, `url(${base}/images/`);
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
