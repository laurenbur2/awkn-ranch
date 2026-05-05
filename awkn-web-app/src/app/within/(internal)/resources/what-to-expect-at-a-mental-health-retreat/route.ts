import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/what-to-expect-at-a-mental-health-retreat/index.html", { withinPort: true });
}
