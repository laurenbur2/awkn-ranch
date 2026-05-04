#!/usr/bin/env node
/**
 * Generate `app/<domain>/<...path>/page.tsx` stub files from src/lib/routes.ts.
 *
 * Idempotent — only writes pages that don't already exist (so hand-edited
 * pages aren't clobbered).
 *
 * Run: node scripts/scaffold-stubs.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Re-implement the manifest here as a flat record (avoids transpiling TS).
// Keep in sync with src/lib/routes.ts. Each value is a list of *paths* to
// generate (segments, slash-separated; "" = domain root).
const ROUTES = {
  awknranch: [
    "",
    "about",
    "day-pass",
    "membership",
    "retreats",
    "events",
    "private-events",
    "collaborations",
    "blog",
    "sauna-hifi",
    "community",
    "contact",
  ],
  within: [
    "",
    "about",
    "team",
    "services",
    "services/ketamine",
    "services/inpatient",
    "services/outpatient",
    "retreats",
    "blog",
    "contact",
    "tellescope",
  ],
  portal: [
    "",
    "bookings",
    "pay",
    "documents",
    "pre-arrival",
    "messages",
    "schedule",
    "receipts",
    "login",
  ],
  bos: [
    "",
    "manage",
    "crm",
    "clients",
    "proposals",
    "releases",
    "spaces",
    "media",
    "highlights-order",
    "phyprop",
    "scheduling",
    "reservations",
    "within-schedule",
    "retreat-house",
    "memberships",
    "packages",
    "events",
    "venue-events",
    "venue-spaces",
    "venue-clients",
    "rentals",
    "accounting",
    "purchases",
    "sms-messages",
    "templates",
    "brand",
    "staff",
    "worktracking",
    "job-titles",
    "users",
    "passwords",
    "faq",
    "planlist",
    "projects",
    "settings",
    "devcontrol",
    "testdev",
    "appdev",
    "login",
  ],
};

const STUB_TEMPLATE = `import { RouteStub } from "~/components/route-stub";\n\nexport default function Page() {\n  return <RouteStub />;\n}\n`;

let created = 0;
let skipped = 0;

for (const [domain, paths] of Object.entries(ROUTES)) {
  for (const path of paths) {
    const dir = path
      ? join(root, "src/app", domain, path)
      : join(root, "src/app", domain);
    const file = join(dir, "page.tsx");
    if (existsSync(file)) {
      skipped++;
      continue;
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, STUB_TEMPLATE);
    created++;
  }
}

console.log(`Generated ${created} stub pages (${skipped} already existed).`);
