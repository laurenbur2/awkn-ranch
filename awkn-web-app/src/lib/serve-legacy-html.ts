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
  /**
   * Apply rewrites for legacy auth-flow pages (login/reset-password,
   * login/update-password, admin/email-approved, admin/email-confirm) so
   * they serve under awknranch with AWKN branding and resolve their
   * shared/* imports against the JS deps already copied to public/ for
   * the /login port:
   *  - Strip `/awkn-ranch/` GH-Pages prefix from absolute URLs.
   *  - Strip parent-traversal from favicon/apple-touch-icon/shared/* refs.
   *  - Rewrite `/assets/branding/X` → `/branding/X` (we mirror AWKN brand
   *    PNGs/SVGs at public/branding/).
   *  - Replace residual `AlpacAPPs` brand strings in <title> with `AWKN
   *    Ranch` — the only Alpaca residue in the auth pages.
   *  - Rewrite `/login/update-password.html` → `/login/update-password`
   *    so the password-reset email link lands at our clean Route Handler.
   */
  legacyAuthPort?: boolean;
  /**
   * Apply BOS / spaces port rewrites for the admin/staff/spaces pages and
   * the associates surface:
   *  - Strip `/awkn-ranch/` GH-Pages prefix from absolute URLs (intra-site
   *    nav like /awkn-ranch/spaces/, /awkn-ranch/community/, plus assets).
   *  - Rewrite `/assets/branding/X` (the leftover after the strip) to
   *    `/branding/X` since we mirror AWKN brand assets at public/branding/.
   * Relative `../../shared/X.js` etc. paths resolve correctly without
   * rewriting because we mirror legacy shared/, styles/, spaces/,
   * associates/ under public/ at the same depth.
   */
  bosPort?: boolean;
  /**
   * Apply Within (clinical) port rewrites for the EMR/sign-in concept pages
   * at `/within/index.html` and `/within/emr/index.html`:
   *  - Rewrite `../`-traversed favicon and apple-touch-icon refs to root.
   *  - Rewrite `../assets/branding/X` (any depth) → `/branding/X`.
   *  - Rewrite bare-relative `src="app.js"` and `href="emr.css"` to
   *    `${assetBase}/app.js` etc., so each page resolves its own JS/CSS
   *    regardless of the URL's trailing-slash behavior.
   * `assetBase` is required and identifies the public/ subpath where this
   * page's bundled JS/CSS live.
   */
  clinicalPort?: { assetBase: string };
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
      .replaceAll(/href="\/within-center\/"/g, 'href="/"')
      .replaceAll(
        /(["'])(?:\.\.\/)+css\/within\.css/g,
        "$1/within-center/css/within.css",
      )
      .replaceAll(
        /(["'])(?:\.\.\/)+favicon\.png/g,
        "$1/within-center/favicon.png",
      )
      .replaceAll(
        /(["'])(?:\.\.\/)+favicon\.ico/g,
        "$1/within-center/favicon.ico",
      )
      .replaceAll(
        /(["'])(?:\.\.\/)+apple-touch-icon\.png/g,
        "$1/within-center/apple-touch-icon.png",
      )
      .replaceAll(/href="\/favicon\.png"/g, 'href="/within-center/favicon.png"')
      .replaceAll(/href="\/favicon\.ico"/g, 'href="/within-center/favicon.ico"')
      .replaceAll(
        /href="\/apple-touch-icon\.png"/g,
        'href="/within-center/apple-touch-icon.png"',
      )
      .replaceAll(/url\('images\//g, "url('/within-center/images/")
      .replaceAll(/url\("images\//g, 'url("/within-center/images/')
      .replaceAll(/url\(images\//g, "url(/within-center/images/")
      .replaceAll(
        /(["'])(?:\.\.\/)+images\//g,
        "$1/within-center/images/",
      )
      .replaceAll(
        /url\(((?:\.\.\/)+)images\//g,
        "url(/within-center/images/",
      )
      .replaceAll(
        /(["'])(?:\.\.\/)*js\/packages\.js/g,
        "$1/within-center/book/js/packages.js",
      );
  }

  if (options.legacyAuthPort) {
    html = html
      .replaceAll(/(["'(=])\/awkn-ranch\//g, "$1/")
      .replaceAll(/(["'])(?:\.\.\/)+favicon\.png/g, "$1/favicon.png")
      .replaceAll(
        /(["'])(?:\.\.\/)+apple-touch-icon\.png/g,
        "$1/apple-touch-icon.png",
      )
      .replaceAll(/(["'])(?:\.\.\/)+shared\//g, "$1/shared/")
      .replaceAll(/(["'])\/assets\/branding\//g, "$1/branding/")
      .replaceAll(/AlpacAPPs/g, "AWKN Ranch")
      .replaceAll(
        /\/login\/update-password\.html/g,
        "/login/update-password",
      );
  }

  if (options.bosPort) {
    html = html
      .replaceAll(/(["'(=])\/awkn-ranch\//g, "$1/")
      .replaceAll(/(["'(=])\/assets\/branding\//g, "$1/branding/");

    // Dev-only auth bypass — set NEXT_PUBLIC_DISABLE_AUTH=true in .env.local
    // to render legacy admin pages against accounts that lack prod
    // permissions. Mirrors the Next/proxy auth-disable knob. The legacy
    // auth.js's hasPermission / hasAnyPermission read this flag and short-
    // circuit to true. Never injected in production (env var is unset).
    if (process.env.NEXT_PUBLIC_DISABLE_AUTH === "true") {
      html = html.replace(
        "</head>",
        `<script>window.__AWKN_DEV_BYPASS_AUTH=true;</script>\n</head>`,
      );
    }
  }

  if (options.clinicalPort) {
    const base = options.clinicalPort.assetBase.replace(/\/$/, "");
    html = html
      .replaceAll(/(["'])(?:\.\.\/)+favicon\.png/g, "$1/favicon.png")
      .replaceAll(
        /(["'])(?:\.\.\/)+apple-touch-icon\.png/g,
        "$1/apple-touch-icon.png",
      )
      .replaceAll(
        /(["'])(?:\.\.\/)+assets\/branding\//g,
        "$1/branding/",
      )
      .replaceAll(/src="app\.js"/g, `src="${base}/app.js"`)
      .replaceAll(/href="emr\.css"/g, `href="${base}/emr.css"`);
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
