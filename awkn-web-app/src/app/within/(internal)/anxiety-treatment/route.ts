import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/anxiety-treatment/index.html", { withinPort: true });
}
