import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/ceremonial-ketamine/discover/index.html", { withinPort: true });
}
