import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("investor/projections/index.html");
}
