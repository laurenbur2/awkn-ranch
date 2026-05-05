import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within-center/book-a-call/index.html", { withinPort: true });
}
