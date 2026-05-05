import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/about/index.html", { withinPort: true });
}
