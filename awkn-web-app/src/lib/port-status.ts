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
    label: "Sign-in (legacy port, functional)",
    domain: "awknranch",
    path: "/login",
    legacyPath: "/login/",
    group: "Reference",
    notes: "Legacy AWKN team-portal sign-in. JS deps copied to public/. After login, redirects to /logged-in. Session uses localStorage key awkn-ranch-auth — /team picks it up automatically.",
  },

  // Within Center marketing site — 37 pages ported verbatim under
  // within/(internal)/. Assets live at public/within-center/{css,images,videos}/.
  // serveLegacyHtml({ withinPort: true }) strips /awkn-ranch/ prefixes and
  // rewrites parent-traversed CSS/favicon refs to absolute paths.
  {
    label: "Within Center — home",
    domain: "within",
    path: "/",
    legacyPath: "/within-center/",
    group: "Marketing",
  },
  {
    label: "About",
    domain: "within",
    path: "/about",
    legacyPath: "/within-center/about/",
    group: "Marketing",
  },
  {
    label: "Our Team",
    domain: "within",
    path: "/our-team",
    legacyPath: "/within-center/our-team/",
    group: "Marketing",
  },
  {
    label: "Facility",
    domain: "within",
    path: "/facility",
    legacyPath: "/within-center/facility/",
    group: "Marketing",
  },
  {
    label: "Contact",
    domain: "within",
    path: "/contact",
    legacyPath: "/within-center/contact/",
    group: "Marketing",
  },
  {
    label: "FAQ",
    domain: "within",
    path: "/faq",
    legacyPath: "/within-center/faq/",
    group: "Marketing",
  },
  {
    label: "Medication Management",
    domain: "within",
    path: "/medication-management",
    legacyPath: "/within-center/medication-management/",
    group: "Marketing",
  },
  {
    label: "Psychedelic Therapy Austin (SEO)",
    domain: "within",
    path: "/psychedelic-therapy-austin",
    legacyPath: "/within-center/psychedelic-therapy-austin/",
    group: "Marketing",
    notes: "Lauren's SEO landing page targeting a lost keyword.",
  },

  {
    label: "Book",
    domain: "within",
    path: "/book",
    legacyPath: "/within-center/book/",
    group: "Booking",
  },
  {
    label: "Book — schedule",
    domain: "within",
    path: "/book/schedule",
    legacyPath: "/within-center/book/schedule/",
    group: "Booking",
  },
  {
    label: "Book a Call",
    domain: "within",
    path: "/book-a-call",
    legacyPath: "/within-center/book-a-call/",
    group: "Booking",
  },
  {
    label: "Admissions Script",
    domain: "within",
    path: "/admissions-script",
    legacyPath: "/within-center/admissions-script/",
    group: "Booking",
  },

  {
    label: "Ceremonial Ketamine — overview",
    domain: "within",
    path: "/ceremonial-ketamine",
    legacyPath: "/within-center/ceremonial-ketamine/",
    group: "Ceremonial Ketamine",
  },
  {
    label: "AWKN — six guided ceremonies",
    domain: "within",
    path: "/ceremonial-ketamine/awkn",
    legacyPath: "/within-center/ceremonial-ketamine/awkn/",
    group: "Ceremonial Ketamine",
  },
  {
    label: "Discover — one ceremony",
    domain: "within",
    path: "/ceremonial-ketamine/discover",
    legacyPath: "/within-center/ceremonial-ketamine/discover/",
    group: "Ceremonial Ketamine",
  },
  {
    label: "Heal — three ceremonies",
    domain: "within",
    path: "/ceremonial-ketamine/heal",
    legacyPath: "/within-center/ceremonial-ketamine/heal/",
    group: "Ceremonial Ketamine",
  },
  {
    label: "Twin Flame — couples reset",
    domain: "within",
    path: "/ceremonial-ketamine/twin-flame",
    legacyPath: "/within-center/ceremonial-ketamine/twin-flame/",
    group: "Ceremonial Ketamine",
  },

  {
    label: "Immersive Retreat — 6-day",
    domain: "within",
    path: "/immersive-retreat",
    legacyPath: "/within-center/immersive-retreat/",
    group: "Immersive Retreat",
  },
  {
    label: "Immersive Retreat — 3-day",
    domain: "within",
    path: "/immersive-retreat/3-day",
    legacyPath: "/within-center/immersive-retreat/3-day/",
    group: "Immersive Retreat",
  },
  {
    label: "Immersive Retreat — reserve",
    domain: "within",
    path: "/immersive-retreat/reserve",
    legacyPath: "/within-center/immersive-retreat/reserve/",
    group: "Immersive Retreat",
  },

  {
    label: "Resources — index",
    domain: "within",
    path: "/resources",
    legacyPath: "/within-center/resources/",
    group: "Resources",
  },
  {
    label: "Burnout: modern diagnosis, old solution",
    domain: "within",
    path: "/resources/burnout-modern-diagnosis-old-solution",
    legacyPath: "/within-center/resources/burnout-modern-diagnosis-old-solution/",
    group: "Resources",
  },
  {
    label: "Ceremonial ketamine vs psychedelic therapy",
    domain: "within",
    path: "/resources/ceremonial-ketamine-vs-psychedelic-therapy",
    legacyPath: "/within-center/resources/ceremonial-ketamine-vs-psychedelic-therapy/",
    group: "Resources",
  },
  {
    label: "Couples reset",
    domain: "within",
    path: "/resources/couples-reset",
    legacyPath: "/within-center/resources/couples-reset/",
    group: "Resources",
  },
  {
    label: "Days after — integration guide",
    domain: "within",
    path: "/resources/days-after-integration-guide",
    legacyPath: "/within-center/resources/days-after-integration-guide/",
    group: "Resources",
  },
  {
    label: "Texas wellness retreats guide",
    domain: "within",
    path: "/resources/texas-wellness-retreats-guide",
    legacyPath: "/within-center/resources/texas-wellness-retreats-guide/",
    group: "Resources",
  },
  {
    label: "What ceremonial ketamine does to the brain",
    domain: "within",
    path: "/resources/what-ceremonial-ketamine-does-to-the-brain",
    legacyPath: "/within-center/resources/what-ceremonial-ketamine-does-to-the-brain/",
    group: "Resources",
  },
  {
    label: "What to expect at a mental health retreat",
    domain: "within",
    path: "/resources/what-to-expect-at-a-mental-health-retreat",
    legacyPath: "/within-center/resources/what-to-expect-at-a-mental-health-retreat/",
    group: "Resources",
  },
  {
    label: "When therapy isn't enough",
    domain: "within",
    path: "/resources/when-therapy-isnt-enough",
    legacyPath: "/within-center/resources/when-therapy-isnt-enough/",
    group: "Resources",
  },
  {
    label: "Why we call it ceremonial",
    domain: "within",
    path: "/resources/why-we-call-it-ceremonial",
    legacyPath: "/within-center/resources/why-we-call-it-ceremonial/",
    group: "Resources",
  },

  {
    label: "Addiction treatment",
    domain: "within",
    path: "/addiction-treatment",
    legacyPath: "/within-center/addiction-treatment/",
    group: "Conditions",
    notes: "Net-new on main (commit c1c67337) — 5 condition pages + footer links.",
  },
  {
    label: "Anxiety treatment",
    domain: "within",
    path: "/anxiety-treatment",
    legacyPath: "/within-center/anxiety-treatment/",
    group: "Conditions",
  },
  {
    label: "Burnout treatment",
    domain: "within",
    path: "/burnout-treatment",
    legacyPath: "/within-center/burnout-treatment/",
    group: "Conditions",
  },
  {
    label: "Depression treatment",
    domain: "within",
    path: "/depression-treatment",
    legacyPath: "/within-center/depression-treatment/",
    group: "Conditions",
  },
  {
    label: "Grief treatment",
    domain: "within",
    path: "/grief-treatment",
    legacyPath: "/within-center/grief-treatment/",
    group: "Conditions",
  },

  {
    label: "Email — deposit received",
    domain: "within",
    path: "/emails/deposit-received",
    legacyPath: "/within-center/emails/deposit-received.html",
    group: "Email Templates",
  },
  {
    label: "Email — ketamine prep",
    domain: "within",
    path: "/emails/ketamine-prep",
    legacyPath: "/within-center/emails/ketamine-prep.html",
    group: "Email Templates",
  },

  // Within (clinical) — concept seeds for the future EMR / clinical portal.
  // Preserved verbatim from legacy /within/ at repo root. NOT a marketing site
  // — these are the early stub of an Electronic Medical Records app that
  // will be built out from inside the new system. The login page is
  // non-functional. Phase 5 / portal scope.
  {
    label: "Within — sign-in (concept stub)",
    domain: "within",
    path: "/within",
    legacyPath: "/within/",
    group: "Clinical (future scope)",
    notes: "Future-scope sign-in concept page. Non-functional. Built out in new system per Phase 5.",
  },
  {
    label: "Within EMR (concept stub)",
    domain: "within",
    path: "/within/emr",
    legacyPath: "/within/emr/",
    group: "Clinical (future scope)",
    notes: "Future-scope EMR concept page. Non-functional. Built out in new system per Phase 5.",
  },
];
