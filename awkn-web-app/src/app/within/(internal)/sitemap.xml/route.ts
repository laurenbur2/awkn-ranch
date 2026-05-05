import fs from "node:fs";
import path from "node:path";

export function GET() {
  const file = fs.readFileSync(
    path.join(process.cwd(), "..", "within-center/sitemap.xml"),
    "utf-8",
  );
  return new Response(file, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
