import { serveLegacyHtml } from "~/lib/serve-legacy-html";

// Routed as /investor/projections-10y. Slugified from the legacy filename
// `investor/projections/index 2.html` (a Finder-dupe-shaped filename for
// what turned out to be a distinct page — the 10-year financial model,
// vs the canonical `index.html` 4-year model).
export function GET() {
  return serveLegacyHtml("investor/projections/index 2.html");
}
