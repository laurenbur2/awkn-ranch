import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/ceremonial-ketamine-vs-psychedelic-therapy/index.html", { withinPort: true });
}
