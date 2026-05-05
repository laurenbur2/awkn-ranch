import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/immersive-retreat/3-day/index.html", { withinPort: true });
}
