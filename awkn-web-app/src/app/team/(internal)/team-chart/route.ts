import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("portal/team-chart/index.html", { bosPort: true });
}
