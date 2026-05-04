/**
 * Route manifest — single source of truth for navigation across all four
 * domains. Phase 2.2 stub pages and the per-domain `<DomainNav>` component
 * both read from here.
 *
 * Adding a route:
 *   1. Add the entry to the appropriate domain below.
 *   2. Create `src/app/<domain>/<segment>/page.tsx` returning `<RouteStub />`.
 *      (Or run `scripts/scaffold-stubs.mjs`.)
 */
import type { DomainKey } from "./domains";

export interface RouteNode {
  /** Last URL segment (empty string = domain root). */
  segment: string;
  /** Display label for navigation. */
  label: string;
  /** Optional grouping label for sectioned navs (used by BOS). */
  group?: string;
  /** Optional one-line description shown on the stub page. */
  description?: string;
  /** Nested routes (rendered as sub-paths). */
  children?: RouteNode[];
}

export interface DomainRoutes {
  domain: DomainKey;
  routes: RouteNode[];
}

const awknranch: DomainRoutes = {
  domain: "awknranch",
  routes: [
    { segment: "", label: "Home", description: "Marketing landing page for AWKN Ranch" },
    { segment: "about", label: "About" },
    { segment: "day-pass", label: "Day Pass", description: "Single-visit access to the property" },
    { segment: "membership", label: "Membership", description: "Recurring access tiers" },
    { segment: "retreats", label: "Retreats", description: "Multi-day retreat offerings" },
    { segment: "events", label: "Events", description: "Public events calendar" },
    { segment: "private-events", label: "Private Events", description: "B2B venue rental inquiry — writes crm_leads" },
    { segment: "collaborations", label: "Collaborations", description: "B2B partnerships inquiry — writes crm_leads" },
    { segment: "blog", label: "Blog", description: "MDX blog posts" },
    { segment: "sauna-hifi", label: "Sauna HiFi" },
    { segment: "community", label: "Community" },
    { segment: "contact", label: "Contact", description: "Public contact form — writes crm_leads" },
  ],
};

const within: DomainRoutes = {
  domain: "within",
  routes: [
    { segment: "", label: "Home", description: "Within Center landing page" },
    { segment: "about", label: "About" },
    { segment: "team", label: "Team" },
    {
      segment: "services",
      label: "Services",
      children: [
        { segment: "ketamine", label: "Ketamine Therapy" },
        { segment: "inpatient", label: "Inpatient Stays" },
        { segment: "outpatient", label: "Outpatient" },
      ],
    },
    { segment: "retreats", label: "Retreats" },
    { segment: "blog", label: "Blog", description: "51 hand-authored clinical posts (Phase 4 migration)" },
    { segment: "contact", label: "Contact", description: "Lead form — writes crm_leads + parallel-write to LeadConnector during transition" },
    { segment: "tellescope", label: "Patient Portal", description: "Deep-link to external Tellescope HIPAA portal" },
  ],
};

const portal: DomainRoutes = {
  domain: "portal",
  routes: [
    { segment: "", label: "Overview", description: "Authenticated client portal home" },
    { segment: "bookings", label: "My Bookings" },
    { segment: "pay", label: "Pay Balance", description: "Stripe PaymentElement + manual methods" },
    { segment: "documents", label: "Sign Documents", description: "SignWell e-signature" },
    { segment: "pre-arrival", label: "Pre-Arrival Checklist" },
    { segment: "messages", label: "Messages", description: "Read-only at MVP; full chat post-MVP" },
    { segment: "schedule", label: "My Schedule" },
    { segment: "receipts", label: "Receipts" },
    { segment: "login", label: "Login", description: "Auth entry point (used when NEXT_PUBLIC_DISABLE_AUTH is off)" },
  ],
};

const bos: DomainRoutes = {
  domain: "bos",
  routes: [
    // Dashboard / shell
    { segment: "", label: "Dashboard", group: "Overview" },
    { segment: "manage", label: "Manage", group: "Overview" },
    // CRM + sales
    { segment: "crm", label: "CRM", group: "Sales" },
    { segment: "clients", label: "Clients", group: "Sales" },
    { segment: "proposals", label: "Proposals", group: "Sales" },
    { segment: "releases", label: "Releases", group: "Sales" },
    // Spaces + media
    { segment: "spaces", label: "Spaces", group: "Spaces" },
    { segment: "media", label: "Media", group: "Spaces" },
    { segment: "highlights-order", label: "Highlights Order", group: "Spaces" },
    { segment: "phyprop", label: "Physical Property", group: "Spaces" },
    // Scheduling
    { segment: "scheduling", label: "Scheduling", group: "Scheduling" },
    { segment: "reservations", label: "Reservations", group: "Scheduling" },
    { segment: "within-schedule", label: "Within Schedule", group: "Scheduling" },
    { segment: "retreat-house", label: "Retreat House", group: "Scheduling" },
    // Memberships
    { segment: "memberships", label: "Memberships", group: "Memberships" },
    { segment: "packages", label: "Packages", group: "Memberships" },
    // Venue (events)
    { segment: "events", label: "Events", group: "Venue" },
    { segment: "venue-events", label: "Venue Events", group: "Venue" },
    { segment: "venue-spaces", label: "Venue Spaces", group: "Venue" },
    { segment: "venue-clients", label: "Venue Clients", group: "Venue" },
    // Rentals
    { segment: "rentals", label: "Rentals", group: "Rentals" },
    // Accounting
    { segment: "accounting", label: "Accounting", group: "Accounting" },
    { segment: "purchases", label: "Purchases", group: "Accounting" },
    // Communications
    { segment: "sms-messages", label: "SMS Messages", group: "Communications" },
    // Templates + brand
    { segment: "templates", label: "Templates", group: "Templates" },
    { segment: "brand", label: "Brand", group: "Templates" },
    // Staff
    { segment: "staff", label: "Staff", group: "Staff" },
    { segment: "worktracking", label: "Work Tracking", group: "Staff" },
    { segment: "job-titles", label: "Job Titles", group: "Staff" },
    // People + auth
    { segment: "users", label: "Users", group: "Users" },
    { segment: "passwords", label: "Passwords", group: "Users" },
    // Knowledge
    { segment: "faq", label: "FAQ", group: "Knowledge" },
    { segment: "planlist", label: "Planlist", group: "Knowledge" },
    { segment: "projects", label: "Projects", group: "Knowledge" },
    // System
    { segment: "settings", label: "Settings", group: "System" },
    { segment: "devcontrol", label: "DevControl", group: "System" },
    { segment: "testdev", label: "TestDev", group: "System" },
    { segment: "appdev", label: "AppDev", group: "System" },
    // Auth
    { segment: "login", label: "Login", group: "System", description: "Auth entry point" },
  ],
};

export const ROUTES: Record<DomainKey, DomainRoutes> = {
  awknranch,
  within,
  portal,
  bos,
};

/** Flatten a domain's nested routes into a list of `{ path, label }` entries. */
export function flattenRoutes(
  domain: DomainKey,
): Array<{ path: string; label: string; group?: string; description?: string }> {
  const result: Array<{
    path: string;
    label: string;
    group?: string;
    description?: string;
  }> = [];
  const walk = (nodes: RouteNode[], prefix: string) => {
    for (const node of nodes) {
      const path = prefix + (node.segment ? "/" + node.segment : "");
      result.push({
        path: path || "/",
        label: node.label,
        group: node.group,
        description: node.description,
      });
      if (node.children) walk(node.children, path);
    }
  };
  walk(ROUTES[domain].routes, "");
  return result;
}
