import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/texas-wellness-retreats-guide/index.html", { withinPort: true });
}
