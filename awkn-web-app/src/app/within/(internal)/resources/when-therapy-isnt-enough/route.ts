import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/when-therapy-isnt-enough/index.html", { withinPort: true });
}
