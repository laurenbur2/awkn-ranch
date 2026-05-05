import { serveLegacyHtml } from "~/lib/serve-legacy-html";

// Slugified from legacy filename pricing/wordpress-embed.html. Embeddable
// pricing widget designed to be iframed into WordPress (within.center
// historically). Kept as reference; unsure if currently embedded anywhere.
export function GET() {
  return serveLegacyHtml("pricing/wordpress-embed.html");
}
