import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("admin/email-confirm.html", { legacyAuthPort: true });
}
