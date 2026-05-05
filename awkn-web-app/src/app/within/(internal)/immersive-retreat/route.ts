import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/immersive-retreat/index.html", { withinPort: true });
}
