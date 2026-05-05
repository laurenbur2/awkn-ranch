import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/admissions-script/index.html", { withinPort: true });
}
