import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("spaces/admin/users.html", { bosPort: true });
}
