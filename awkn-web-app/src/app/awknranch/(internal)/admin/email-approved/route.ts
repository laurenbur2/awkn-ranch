import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("admin/email-approved.html", { legacyAuthPort: true });
}
