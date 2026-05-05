import { serveLegacyHtml } from "~/lib/serve-legacy-html";

export function GET() {
  return serveLegacyHtml("within/emr/index.html", {
    clinicalPort: { assetBase: "/within-clinical/emr" },
  });
}
