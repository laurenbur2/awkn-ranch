import fs from "node:fs";
import path from "node:path";

export function GET() {
  const file = fs.readFileSync(
    path.join(process.cwd(), "..", "within-center/robots.txt"),
    "utf-8",
  );
  return new Response(file, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
