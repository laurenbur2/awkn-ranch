import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("spaces/admin/brand.html", { bosPort: true });
}
