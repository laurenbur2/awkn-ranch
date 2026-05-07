/**
 * robots.txt for the team subdomain.
 *
 * Disallows ALL crawlers — admin/BOS pages should never be in search
 * results. This is the team subdomain's catchall; awknranch + within
 * have their own robots.txt setups for their public surfaces.
 */
export function GET() {
  return new Response("User-agent: *\nDisallow: /\n", {
    headers: {
      "Content-Type": "text/plain",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
