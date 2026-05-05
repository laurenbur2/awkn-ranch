import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/psychedelic-therapy-austin/index.html", { withinPort: true });
}
