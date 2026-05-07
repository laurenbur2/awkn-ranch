import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("portal/index.html", { bosPort: true });
}
