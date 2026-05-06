import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("associates/worktracking.html", { bosPort: true });
}
