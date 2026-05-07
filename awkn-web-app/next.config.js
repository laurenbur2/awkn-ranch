/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // Pin Turbopack to this app's directory — the legacy AWKN repo at the parent
  // path also has a package-lock.json (for Tailwind v4 CLI), which Next would
  // otherwise pick as the workspace root.
  turbopack: {
    root: import.meta.dirname,
  },

  // Prevent server-only DB drivers from being traced into client bundles.
  // postgres + @libsql/client transitively use node `tls`/`net`/`crypto`.
  serverExternalPackages: ["postgres", "@libsql/client"],

  // Strip the legacy GH-Pages base path (`/awkn-ranch/*`) at the framework
  // level so it works on every request, including static assets. The proxy's
  // matcher excludes image/css extensions for perf, so its in-proxy strip
  // doesn't fire for `/awkn-ranch/assets/branding/X.png` etc. — those need
  // this framework-level rewrite to land in `public/`. Phase-6-throwaway:
  // disappears as legacy JS gets deleted page-by-page.
  async rewrites() {
    return [
      { source: "/awkn-ranch/:path*", destination: "/:path*" },
    ];
  },

  // Phase 6a.8 — 301 redirects from legacy awknranch.com paths to the new
  // team.awknranch.com home of all team-facing surfaces. These activate at
  // production cutover (when team.awknranch.com is live on Vercel + DNS);
  // local dev hits *.localhost which doesn't match these `host` rules, so
  // redirects are a no-op locally.
  //
  // EXPLICITLY EXCLUDED: /api/webhooks/* — vendor URLs (Stripe, SignWell,
  // Resend, Square) are registered against awknranch.com endpoints in
  // their dashboards. Keep webhook handlers on awknranch.com host so we
  // don't need to update vendor configs at cutover time.
  async redirects() {
    /** @type {Array<{type: "host", value: string}>} */
    const legacyHost = [
      { type: "host", value: "awknranch.com" },
      { type: "host", value: "www.awknranch.com" },
    ];
    // Each redirect rule is duplicated for both bare-host and www variants
    // because Next.js redirect rules don't support a host pattern with OR.
    const rules = [];
    for (const has of legacyHost) {
      rules.push(
        // BOS Admin paths
        {
          source: "/spaces/admin/:path*",
          has: [has],
          destination: "https://team.awknranch.com/spaces/admin/:path*",
          permanent: true,
        },
        // Team Portal: /portal collapsed to /
        {
          source: "/portal",
          has: [has],
          destination: "https://team.awknranch.com",
          permanent: true,
        },
        {
          source: "/portal/team-chart",
          has: [has],
          destination: "https://team.awknranch.com/team-chart",
          permanent: true,
        },
        // Auth flow
        {
          source: "/login",
          has: [has],
          destination: "https://team.awknranch.com/login",
          permanent: true,
        },
        {
          source: "/login/:path*",
          has: [has],
          destination: "https://team.awknranch.com/login/:path*",
          permanent: true,
        },
        {
          source: "/admin/email-:variant",
          has: [has],
          destination: "https://team.awknranch.com/admin/email-:variant",
          permanent: true,
        },
        // Post-login landing
        {
          source: "/logged-in",
          has: [has],
          destination: "https://team.awknranch.com/logged-in",
          permanent: true,
        },
        // Team API routes (NOT webhooks — those stay on awknranch host)
        {
          source: "/api/team/:path*",
          has: [has],
          destination: "https://team.awknranch.com/api/team/:path*",
          permanent: true,
        },
      );
    }
    return rules;
  },

  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/:path*",
        headers: [
          // Content Security Policy - Protects against XSS, clickjacking, and other code injection attacks
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://cdn.jsdelivr.net", // Next.js requires unsafe-inline + unsafe-eval; jsdelivr serves Supabase JS bundle on legacy ported pages (e.g. /team)
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // Allow inline styles + Google Fonts stylesheets
              "img-src 'self' data: blob: https:", // Allow images from HTTPS sources and data URIs
              "font-src 'self' data: https://fonts.gstatic.com", // Allow Google Fonts woff2 files
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co", // Supabase API and realtime
              "frame-src 'self' https://www.google.com https://maps.google.com", // Google Maps embed on /contact

              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'self'", // Prevents your site from being embedded in iframes (clickjacking protection)
              "upgrade-insecure-requests",
            ].join("; "),
          },
          // Prevents browsers from incorrectly detecting non-scripts as scripts
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Prevents your site from being embedded in iframes (clickjacking protection)
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // Controls how much referrer information should be included with requests
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Controls which browser features and APIs can be used
          {
            key: "Permissions-Policy",
            value: [
              "camera=()",
              "microphone=()",
              "geolocation=()",
              "interest-cohort=()", // Disables FLoC
            ].join(", "),
          },
          // HTTP Strict Transport Security - Forces HTTPS
          // Note: Vercel already sets this, but we include it for completeness
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // Enable DNS prefetch
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
        ],
      },
    ];
  },
};

export default config;
