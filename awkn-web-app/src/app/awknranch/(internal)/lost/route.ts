import { serveLegacyHtml } from "~/lib/serve-legacy-html";

// Despite the filename, lost.html is "Tricky Lockout Numbers" — a member /
// staff reference page with lockout-related phone numbers. Not a 404
// alternate. Linked from spaces/admin/venue-{events,clients,spaces}.js.
export function GET() {
  return serveLegacyHtml("lost.html");
}
