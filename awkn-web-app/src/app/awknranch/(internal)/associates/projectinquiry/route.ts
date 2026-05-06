import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("associates/projectinquiry.html", { bosPort: true });
}
