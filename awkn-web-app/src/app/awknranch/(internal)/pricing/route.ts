import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("pricing/index.html", { imageBase: "/pricing" });
}
