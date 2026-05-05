import Link from "next/link";

import { DOMAINS } from "~/lib/domains";
import { PORTED_PAGES, type PortedPage } from "~/lib/port-status";

const LEGACY_LIVE_BASE = "https://laurenbur2.github.io/awkn-ranch";

function groupPortedPages(): Map<string, PortedPage[]> {
  const groups = new Map<string, PortedPage[]>();
  for (const page of PORTED_PAGES) {
    const list = groups.get(page.group) ?? [];
    list.push(page);
    groups.set(page.group, list);
  }
  return groups;
}

/**
 * Dev landing page — shown when visiting bare `localhost:3000`.
 *
 * In production, hostname-based proxy rewriting routes every request into
 * the right domain tree, so this page only appears during local development
 * as a navigation aid for clicking into each domain and tracking which
 * legacy pages have been ported.
 */
export default function DevLandingPage() {
  const port = process.env.PORT ?? "3000";

  return (
    <main className="flex min-h-screen flex-col items-center bg-background p-8">
      <div className="container max-w-3xl flex flex-col gap-10 py-8">
        <header>
          <h1 className="text-4xl font-bold tracking-tight">awkn-web-app</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Multi-domain Next.js app — dev landing
          </p>
        </header>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Domains
          </h2>
          <div className="grid gap-3">
            {DOMAINS.map((d) => {
              const devUrl = `http://${d.key}.localhost:${port}`;
              return (
                <Link
                  key={d.key}
                  href={devUrl}
                  className="group rounded-lg border border-border p-4 transition hover:border-primary"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{d.label}</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {d.key}.localhost:{port}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {d.description}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Prod: {d.prodHosts.join(", ")}
                    {d.authRequired ? " · auth required" : ""}
                  </p>
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Ported pages ({PORTED_PAGES.length})
          </h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Legacy pages that have landed in the new app. Compare to the live
            legacy URL to verify visual parity.
          </p>
          <div className="grid gap-2">
            {Array.from(groupPortedPages()).map(([groupLabel, pages]) => (
              <details
                key={groupLabel}
                open
                className="group rounded-lg border border-border"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between p-3 font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
                  <span>
                    {groupLabel}{" "}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({pages.length})
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground transition group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <div className="grid gap-2 px-3 pb-3 pt-0">
                  {pages.map((p) => {
                    const newUrl = `http://${p.domain}.localhost:${port}${p.path}`;
                    const legacyUrl = `${LEGACY_LIVE_BASE}${p.legacyPath}`;
                    return (
                      <div
                        key={`${p.domain}${p.path}`}
                        className="rounded-md border border-border/60 p-3"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="font-medium">{p.label}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {p.domain}
                          </span>
                        </div>
                        {p.notes && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {p.notes}
                          </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                          <Link
                            href={newUrl}
                            className="font-mono text-primary hover:underline"
                          >
                            ↳ new: {p.domain}.localhost:{port}
                            {p.path}
                          </Link>
                          <a
                            href={legacyUrl}
                            target="_blank"
                            rel="noopener"
                            className="font-mono text-muted-foreground hover:underline"
                          >
                            ↳ legacy: {p.legacyPath}
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>

        <footer className="text-xs text-muted-foreground">
          Tip: dev auth bypass is{" "}
          <code className="rounded bg-muted px-1 py-0.5">
            NEXT_PUBLIC_DISABLE_AUTH=true
          </code>{" "}
          in <code className="rounded bg-muted px-1 py-0.5">.env.local</code>.
        </footer>
      </div>
    </main>
  );
}
