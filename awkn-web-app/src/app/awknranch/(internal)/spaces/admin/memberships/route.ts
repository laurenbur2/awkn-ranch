import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("spaces/admin/memberships.html", { bosPort: true });
}
