import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/days-after-integration-guide/index.html", { withinPort: true });
}
