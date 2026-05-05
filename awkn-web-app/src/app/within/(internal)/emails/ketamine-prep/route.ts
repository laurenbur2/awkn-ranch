import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/emails/ketamine-prep.html", { withinPort: true });
}
