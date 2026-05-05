import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/ceremonial-ketamine/twin-flame/index.html", { withinPort: true });
}
