import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("login/update-password.html", { legacyAuthPort: true });
}
