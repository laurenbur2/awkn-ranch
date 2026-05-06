import Link from "next/link";
import { headers } from "next/headers";
import { resolveDomain, type DomainKey, DOMAINS } from "~/lib/domains";
import { flattenRoutes } from "~/lib/routes";

/**
 * Universal Phase 2.2 stub page. Reads the request's `x-rewrite-pathname`
 * header (set by middleware) plus the `host` header to figure out which
 * domain + route is being rendered, then shows a placeholder.
 *
 * Every page.tsx in awknranch/within/portal/team folders is just:
 *   import { RouteStub } from "~/components/route-stub";
 *   export default function Page() { return <RouteStub />; }
 */
export async function RouteStub() {
  const h = await headers();
  const host = h.get("host");
  const domain = resolveDomain(host);

  // The middleware rewrites /foo → /<domain>/foo. The `next-url` header tracks
  // the original public URL before rewrite, but for the stub we just want the
  // pretty path. We render the domain key + the path under it.
  const rewrittenPath = h.get("x-matched-path") ?? h.get("next-url") ?? "/";

  const domainKey = domain?.key ?? null;
  const allRoutes = domainKey ? flattenRoutes(domainKey) : [];
  const current = allRoutes.find((r) =>
    r.path === "/"
      ? rewrittenPath === `/${domainKey}` || rewrittenPath === `/${domainKey}/`
      : rewrittenPath.endsWith(r.path),
  );

  return (
    <div className="container max-w-3xl flex flex-col gap-6 py-12">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
        <span>{domain?.label ?? "unknown"}</span>
        <span>·</span>
        <span>{rewrittenPath}</span>
      </div>

      <h1 className="text-4xl font-bold tracking-tight">
        {current?.label ?? "Page"}
      </h1>

      {current?.description && (
        <p className="text-lg text-muted-foreground">{current.description}</p>
      )}

      <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
        Phase 2.2 stub. Real content lands when this surface gets ported in
        its phase (3 = awknranch, 4 = within, 5 = portal, 6 = team).
      </div>

      <DomainCrossLinks current={domainKey} />
    </div>
  );
}

function DomainCrossLinks({ current }: { current: DomainKey | null }) {
  return (
    <nav className="mt-8 flex flex-wrap gap-2 text-xs">
      <span className="text-muted-foreground">Jump to other domains:</span>
      {DOMAINS.filter((d) => d.key !== current).map((d) => {
        const port = process.env.PORT ?? "3000";
        return (
          <Link
            key={d.key}
            href={`http://${d.key}.localhost:${port}`}
            className="rounded border border-border px-2 py-0.5 hover:border-primary"
          >
            {d.label}
          </Link>
        );
      })}
      <Link
        href={`http://localhost:${process.env.PORT ?? "3000"}`}
        className="rounded border border-border px-2 py-0.5 hover:border-primary"
      >
        ← Dev landing
      </Link>
    </nav>
  );
}
