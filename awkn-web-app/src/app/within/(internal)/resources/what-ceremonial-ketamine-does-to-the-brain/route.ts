import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/what-ceremonial-ketamine-does-to-the-brain/index.html", { withinPort: true });
}
