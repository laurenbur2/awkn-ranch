import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/resources/burnout-modern-diagnosis-old-solution/index.html", { withinPort: true });
}
