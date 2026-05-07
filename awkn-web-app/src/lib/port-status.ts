/**
 * Live port-progress index. Each entry is a legacy page that's been ported
 * into awkn-web-app. The dev landing (`/`) reads this list and renders
 * clickable cards so we can eyeball progress at any moment.
 *
 * As pages get ported, add entries here. As legacy pages get deleted (no
 * port), don't add them — the absence is the progress signal.
 */

export type PortDomain = "awknranch" | "within" | "portal" | "team";

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
  // Public site — Lauren's net-new public AWKN Ranch marketing site
  // (commits 8f463a41 + 2c20f2c2 on main, 2026-05-06). Replaced the old
  // root index.html (which was the team portal — moved to /portal/).
  // Shared chrome via /assets/awkn/site.css; bare-relative + parent-
  // traversed asset refs resolve naturally — no serveLegacyHtml rewrites
  // needed. Asset bundle mirrored at awkn-web-app/public/assets/awkn/.
  {
    label: "AWKN Ranch — home",
    domain: "awknranch",
    path: "/",
    legacyPath: "/index.html",
    group: "Public site",
    notes: "Lauren's public marketing home. Replaced the old team portal at root (which moved to /portal/).",
  },
  {
    label: "Property",
    domain: "awknranch",
    path: "/property",
    legacyPath: "/property/",
    group: "Public site",
  },
  {
    label: "Book a Stay",
    domain: "awknranch",
    path: "/book",
    legacyPath: "/book/",
    group: "Public site",
  },
  {
    label: "Host a Retreat",
    domain: "awknranch",
    path: "/host-a-retreat",
    legacyPath: "/host-a-retreat/",
    group: "Public site",
  },
  {
    label: "Services",
    domain: "awknranch",
    path: "/services",
    legacyPath: "/services/",
    group: "Public site",
    notes: "Within Center feature block + amenities + add-ons. Lauren's redesign 2026-05-06.",
  },
  {
    label: "Events",
    domain: "awknranch",
    path: "/events",
    legacyPath: "/events/",
    group: "Public site",
  },
  {
    label: "Contact",
    domain: "awknranch",
    path: "/contact",
    legacyPath: "/contact/",
    group: "Public site",
  },

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
    group: "Public site",
    notes: "Flipped 2026-05-06 — was the internal team org chart, now the public AWKN Ranch team page (Lauren's commit 2c20f2c2). The internal org chart moved to /portal/team-chart/.",
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
  // Team Portal — moved from root /index.html in Lauren's 2026-05-06
  // restructure (commit 8f463a41). Sign-in landing for AWKN team. Uses
  // Supabase JS via CDN; bosPort strips /awkn-ranch/ prefix from absolute
  // refs. Eventually destined for team.awknranch.com per Phase 6 IA.
  {
    label: "Team Portal — sign-in landing",
    domain: "awknranch",
    path: "/portal",
    legacyPath: "/portal/index.html",
    group: "Team Portal",
    notes: "Was at root /index.html before Lauren's 2026-05-06 split. Reads Supabase auth state, redirects signed-in users to /spaces/admin/dashboard.",
  },
  {
    label: "Team Portal — Org Chart",
    domain: "awknranch",
    path: "/portal/team-chart",
    legacyPath: "/portal/team-chart/index.html",
    group: "Team Portal",
    notes: "Was at /team/ before Lauren's 2026-05-06 split (when /team/ became the public team page).",
  },

  {
    label: "Sign-in (legacy port, functional)",
    domain: "awknranch",
    path: "/login",
    legacyPath: "/login/",
    group: "Auth",
    notes: "Legacy AWKN team-portal sign-in. JS deps copied to public/. After login, redirects to /logged-in. Session uses localStorage key awkn-ranch-auth — /team picks it up automatically.",
  },
  {
    label: "Reset password (request)",
    domain: "awknranch",
    path: "/login/reset-password",
    legacyPath: "/login/reset-password.html",
    group: "Auth",
    notes: "Legacy reset-password page, AlpacAPPs-branded → rebranded AWKN at serve time. Uses shared/auth.js (already in public/). Patched auth.js to export getBasePath which legacy reset page imported but was never defined.",
  },
  {
    label: "Update password (consume reset link)",
    domain: "awknranch",
    path: "/login/update-password",
    legacyPath: "/login/update-password.html",
    group: "Auth",
  },
  {
    label: "Email approved (admin confirmation)",
    domain: "awknranch",
    path: "/admin/email-approved",
    legacyPath: "/admin/email-approved.html",
    group: "Auth",
    notes: "Standalone status page rendered after admin approves an email type. Reads URL params; no Supabase calls.",
  },
  {
    label: "Email confirm (admin)",
    domain: "awknranch",
    path: "/admin/email-confirm",
    legacyPath: "/admin/email-confirm.html",
    group: "Auth",
    notes: "Admin email-confirmation flow. Reads URL params; no Supabase calls.",
  },

  // BOS / Spaces Admin — internal surface for the AWKN business operating
  // system. 39 admin pages + 4 associates pages, all served verbatim via
  // Route Handlers under awknranch/(internal)/. Shared infrastructure
  // mirrored at awkn-web-app/public/{shared,styles,spaces,associates,
  // branding}/ so legacy ../-relative imports resolve naturally — same
  // depth pattern as legacy GH-Pages structure. bosPort option strips
  // /awkn-ranch/ prefix and rewrites /assets/branding/X → /branding/X.
  //
  // The 4 public Spaces pages (/spaces, /spaces/apply, /spaces/hostevent,
  // /spaces/verify, /spaces/w9) were retired 2026-05-06 per IA review —
  // venue rentals will be handled directly through CRM, not a public-facing
  // application form.
  {
    label: "BOS — Dashboard",
    domain: "awknranch",
    path: "/spaces/admin/dashboard",
    legacyPath: "/spaces/admin/dashboard.html",
    group: "BOS Admin",
    notes: "Main staff/admin dashboard. Cached-auth pattern (localStorage[awkn-ranch-cached-auth]) for instant render before Supabase verification.",
  },
  {
    label: "BOS — Index (admin home)",
    domain: "awknranch",
    path: "/spaces/admin/index",
    legacyPath: "/spaces/admin/index.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Manage",
    domain: "awknranch",
    path: "/spaces/admin/manage",
    legacyPath: "/spaces/admin/manage.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — CRM",
    domain: "awknranch",
    path: "/spaces/admin/crm",
    legacyPath: "/spaces/admin/crm.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Clients",
    domain: "awknranch",
    path: "/spaces/admin/clients",
    legacyPath: "/spaces/admin/clients.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Users",
    domain: "awknranch",
    path: "/spaces/admin/users",
    legacyPath: "/spaces/admin/users.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Staff",
    domain: "awknranch",
    path: "/spaces/admin/staff",
    legacyPath: "/spaces/admin/staff.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Facilitators",
    domain: "awknranch",
    path: "/spaces/admin/facilitators",
    legacyPath: "/spaces/admin/facilitators.html",
    group: "BOS Admin",
    notes: "Lauren's recent main work — Within Center facilitator scheduling.",
  },
  {
    label: "BOS — Job Titles",
    domain: "awknranch",
    path: "/spaces/admin/job-titles",
    legacyPath: "/spaces/admin/job-titles.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Passwords",
    domain: "awknranch",
    path: "/spaces/admin/passwords",
    legacyPath: "/spaces/admin/passwords.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Scheduling",
    domain: "awknranch",
    path: "/spaces/admin/scheduling",
    legacyPath: "/spaces/admin/scheduling.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Within Schedule",
    domain: "awknranch",
    path: "/spaces/admin/within-schedule",
    legacyPath: "/spaces/admin/within-schedule.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Reservations",
    domain: "awknranch",
    path: "/spaces/admin/reservations",
    legacyPath: "/spaces/admin/reservations.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Events",
    domain: "awknranch",
    path: "/spaces/admin/events",
    legacyPath: "/spaces/admin/events.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Venue Events",
    domain: "awknranch",
    path: "/spaces/admin/venue-events",
    legacyPath: "/spaces/admin/venue-events.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Venue Spaces",
    domain: "awknranch",
    path: "/spaces/admin/venue-spaces",
    legacyPath: "/spaces/admin/venue-spaces.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Venue Clients",
    domain: "awknranch",
    path: "/spaces/admin/venue-clients",
    legacyPath: "/spaces/admin/venue-clients.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Spaces (Physical)",
    domain: "awknranch",
    path: "/spaces/admin/spaces",
    legacyPath: "/spaces/admin/spaces.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Physical Property",
    domain: "awknranch",
    path: "/spaces/admin/phyprop",
    legacyPath: "/spaces/admin/phyprop.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Retreat House",
    domain: "awknranch",
    path: "/spaces/admin/retreat-house",
    legacyPath: "/spaces/admin/retreat-house.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Memberships",
    domain: "awknranch",
    path: "/spaces/admin/memberships",
    legacyPath: "/spaces/admin/memberships.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Packages",
    domain: "awknranch",
    path: "/spaces/admin/packages",
    legacyPath: "/spaces/admin/packages.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Rentals",
    domain: "awknranch",
    path: "/spaces/admin/rentals",
    legacyPath: "/spaces/admin/rentals.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Plan List",
    domain: "awknranch",
    path: "/spaces/admin/planlist",
    legacyPath: "/spaces/admin/planlist.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Projects",
    domain: "awknranch",
    path: "/spaces/admin/projects",
    legacyPath: "/spaces/admin/projects.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Worktracking",
    domain: "awknranch",
    path: "/spaces/admin/worktracking",
    legacyPath: "/spaces/admin/worktracking.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Releases",
    domain: "awknranch",
    path: "/spaces/admin/releases",
    legacyPath: "/spaces/admin/releases.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Purchases",
    domain: "awknranch",
    path: "/spaces/admin/purchases",
    legacyPath: "/spaces/admin/purchases.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Accounting",
    domain: "awknranch",
    path: "/spaces/admin/accounting",
    legacyPath: "/spaces/admin/accounting.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Media",
    domain: "awknranch",
    path: "/spaces/admin/media",
    legacyPath: "/spaces/admin/media.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Templates",
    domain: "awknranch",
    path: "/spaces/admin/templates",
    legacyPath: "/spaces/admin/templates.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — FAQ",
    domain: "awknranch",
    path: "/spaces/admin/faq",
    legacyPath: "/spaces/admin/faq.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — SMS Messages",
    domain: "awknranch",
    path: "/spaces/admin/sms-messages",
    legacyPath: "/spaces/admin/sms-messages.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Brand",
    domain: "awknranch",
    path: "/spaces/admin/brand",
    legacyPath: "/spaces/admin/brand.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Highlights Order",
    domain: "awknranch",
    path: "/spaces/admin/highlights-order",
    legacyPath: "/spaces/admin/highlights-order.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Settings",
    domain: "awknranch",
    path: "/spaces/admin/settings",
    legacyPath: "/spaces/admin/settings.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — App Dev",
    domain: "awknranch",
    path: "/spaces/admin/appdev",
    legacyPath: "/spaces/admin/appdev.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Test Dev",
    domain: "awknranch",
    path: "/spaces/admin/testdev",
    legacyPath: "/spaces/admin/testdev.html",
    group: "BOS Admin",
  },
  {
    label: "BOS — Dev Control",
    domain: "awknranch",
    path: "/spaces/admin/devcontrol",
    legacyPath: "/spaces/admin/devcontrol.html",
    group: "BOS Admin",
  },

  // Associates surface retired 2026-05-06 (Phase 6a.4) — work-tracking
  // moved into BOS proper.

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
