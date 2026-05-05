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
  /**
   * Apply within-center port rewrites:
   *  - Strip `/awkn-ranch/` GH-Pages prefix from absolute URLs so they resolve
   *    against the new app's public root (where the assets are mirrored).
   *  - Rewrite parent-traversed `../css/within.css` (any depth) to the
   *    absolute `/within-center/css/within.css` published under public/.
   *  - Rewrite parent-traversed `../favicon.png` / `../apple-touch-icon.png`
   *    to root-absolute (defensive; Lauren's SEO commit already fixed most).
   * Pages must be served at URLs whose depth matches the legacy depth so
   * intra-within `<a href="../X/">` links resolve to the right ported page.
   */
  withinPort?: boolean;
}

/**
 * Reads a legacy static HTML page (under the repo root, outside awkn-web-app)
 * and returns it as an HTTP Response. Used by Route Handlers under
 * `app/awknranch/(internal)/...` and `app/within/(internal)/...` to serve
 * standalone pages verbatim — they bring their own fonts and styles and
 * don't share chrome with the rest of the app, so full-document delivery
 * preserves 1:1 visual parity without re-templating.
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

  if (options.withinPort) {
    html = html
      .replaceAll(/(["'(=])\/awkn-ranch\//g, "$1/")
      .replaceAll(
        /(["'])(?:\.\.\/)+css\/within\.css/g,
        "$1/within-center/css/within.css",
      )
      .replaceAll(/(["'])(?:\.\.\/)+favicon\.png/g, "$1/favicon.png")
      .replaceAll(/(["'])(?:\.\.\/)+favicon\.ico/g, "$1/favicon.ico")
      .replaceAll(
        /(["'])(?:\.\.\/)+apple-touch-icon\.png/g,
        "$1/apple-touch-icon.png",
      );
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
