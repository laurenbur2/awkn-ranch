import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("investor-presentation/index.html");
}
