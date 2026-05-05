import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("operations/index.html");
}
