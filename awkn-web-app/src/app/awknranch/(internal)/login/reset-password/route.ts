import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("login/reset-password.html", { legacyAuthPort: true });
}
