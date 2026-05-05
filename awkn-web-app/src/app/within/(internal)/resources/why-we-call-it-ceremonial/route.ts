import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/why-we-call-it-ceremonial/index.html", { withinPort: true });
}
