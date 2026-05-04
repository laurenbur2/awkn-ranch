import Link from "next/link";
import { flattenRoutes } from "~/lib/routes";
import type { DomainKey } from "~/lib/domains";
import { DOMAINS } from "~/lib/domains";

/**
 * Per-domain navigation. Reads the route manifest and renders a flat or
 * grouped list of links. The href is the *public* URL (no domain prefix) —
 * middleware rewrites these to internal `/{domain}/...` paths during prod.
 */
export function DomainNav({ domain }: { domain: DomainKey }) {
  const config = DOMAINS.find((d) => d.key === domain);
  const routes = flattenRoutes(domain).map((r) => {
    // r.path looks like "/", "/about", "/services/ketamine", etc — already
    // relative to the domain root since flattenRoutes builds without prefix.
    return r;
  });

  // Group routes by `group` if any have one (BOS uses groups; others don't).
  const grouped = new Map<string, typeof routes>();
  let hasGroups = false;
  for (const r of routes) {
    const key = r.group ?? "";
    if (r.group) hasGroups = true;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(r);
  }

  return (
    <header className="border-b border-border bg-card/40">
      <div className="container max-w-6xl flex flex-col gap-3 px-6 py-4">
        <div className="flex items-center justify-between">
          <Link href="/" className="font-semibold">
            {config?.label ?? domain}
          </Link>
          <span className="font-mono text-xs text-muted-foreground">
            {config?.prodHosts[0] ?? domain}
          </span>
        </div>

        {hasGroups ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-5">
            {Array.from(grouped.entries()).map(([group, items]) => (
              <div key={group} className="flex flex-col gap-1">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {group}
                </p>
                {items.map((r) => (
                  <Link
                    key={r.path}
                    href={r.path === "/" ? "/" : r.path}
                    className="text-xs hover:text-primary"
                  >
                    {r.label}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {routes.map((r) => (
              <Link
                key={r.path}
                href={r.path === "/" ? "/" : r.path}
                className="hover:text-primary"
              >
                {r.label}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
