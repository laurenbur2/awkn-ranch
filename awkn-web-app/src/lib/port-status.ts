/**
 * Live port-progress index. Each entry is a legacy page that's been ported
 * into awkn-web-app. The dev landing (`/`) reads this list and renders
 * clickable cards so we can eyeball progress at any moment.
 *
 * As pages get ported, add entries here. As legacy pages get deleted (no
 * port), don't add them — the absence is the progress signal.
 */

export type PortDomain = "awknranch" | "within" | "portal" | "bos";

export interface PortedPage {
  /** Display label. */
  label: string;
  /** Domain this page lives under in the new app. */
  domain: PortDomain;
  /** Path within the domain (e.g. `/operations`). */
  path: string;
  /** Legacy path on the live GH Pages site, for visual-parity comparison. */
  legacyPath: string;
  /** Section the dev landing groups this page under. */
  group: string;
  /** One-line note about the port. */
  notes?: string;
}

export const PORTED_PAGES: PortedPage[] = [
  {
    label: "Operations — retreat logistics",
    domain: "awknranch",
    path: "/operations",
    legacyPath: "/operations/",
    group: "Investor / Operations",
    notes: "Standalone internal-ops page. Served verbatim via Route Handler.",
  },
  {
    label: "Investor overview",
    domain: "awknranch",
    path: "/investor",
    legacyPath: "/investor/",
    group: "Investor / Operations",
  },
  {
    label: "Investor presentation",
    domain: "awknranch",
    path: "/investor-presentation",
    legacyPath: "/investor-presentation/",
    group: "Investor / Operations",
  },
  {
    label: "Financial projections — 4-year",
    domain: "awknranch",
    path: "/investor/projections",
    legacyPath: "/investor/projections/",
    group: "Investor / Operations",
  },
  {
    label: "Financial projections — 10-year",
    domain: "awknranch",
    path: "/investor/projections-10y",
    legacyPath: "/investor/projections/index 2.html",
    group: "Investor / Operations",
    notes: "Slugified from a Finder-dupe-shaped filename.",
  },

  // Reference: pages reviewed in the ecosystem audit and chosen to keep as
  // assets rather than delete. Most are public-facing legacy surfaces that
  // may inform future ports (e.g. canonical-pricing decision, team listing,
  // schedule UX). Served verbatim — no functional re-implementation.
  {
    label: "Pricing",
    domain: "awknranch",
    path: "/pricing",
    legacyPath: "/pricing/",
    group: "Reference",
    notes: "One of three pages with disagreeing AWKN prices — closest to canonical.",
  },
  {
    label: "Pricing — WordPress embed widget",
    domain: "awknranch",
    path: "/pricing/wordpress-embed",
    legacyPath: "/pricing/wordpress-embed.html",
    group: "Reference",
    notes: "Iframe-able pricing widget for WP. Possible Within bridge before WP→Next rebuild.",
  },
  {
    label: "Team",
    domain: "awknranch",
    path: "/team",
    legacyPath: "/team/",
    group: "Reference",
  },
  {
    label: "Schedule (public)",
    domain: "awknranch",
    path: "/schedule",
    legacyPath: "/schedule/",
    group: "Reference",
  },
  {
    label: "Schedule — manage",
    domain: "awknranch",
    path: "/schedule/manage",
    legacyPath: "/schedule/manage.html",
    group: "Reference",
  },
  {
    label: "Retreat house",
    domain: "awknranch",
    path: "/retreat",
    legacyPath: "/retreat/",
    group: "Reference",
  },
  {
    label: "Tricky lockout numbers",
    domain: "awknranch",
    path: "/lost",
    legacyPath: "/lost.html",
    group: "Reference",
    notes: "Not a 404 page — member/staff lockout reference. Linked from BOS venue admin.",
  },
];
