import Link from "next/link";

import { CompareButton } from "~/components/compare-button";
import { DOMAINS } from "~/lib/domains";
import { PORTED_PAGES, type PortedPage, type PortDomain } from "~/lib/port-status";

const LEGACY_LIVE_BASE = "https://laurenbur2.github.io/awkn-ranch";

function groupByLabel(pages: PortedPage[]): Map<string, PortedPage[]> {
  const groups = new Map<string, PortedPage[]>();
  for (const page of pages) {
    const list = groups.get(page.group) ?? [];
    list.push(page);
    groups.set(page.group, list);
  }
  return groups;
}

function portedPagesFor(domain: PortDomain): PortedPage[] {
  return PORTED_PAGES.filter((p) => p.domain === domain);
}

/**
 * Dev landing page — shown when visiting bare `localhost:3000`.
 *
 * In production, hostname-based proxy rewriting routes every request into
 * the right domain tree, so this page only appears during local development
 * as a navigation aid for clicking into each domain and tracking which
 * legacy pages have been ported (each domain card surfaces its own port
 * progress nested inside it).
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
            Domains ({DOMAINS.length})
          </h2>
          <div className="grid gap-3">
            {DOMAINS.map((d) => {
              const devUrl = `http://${d.key}.localhost:${port}`;
              const ports = portedPagesFor(d.key as PortDomain);
              const groups = groupByLabel(ports);
              return (
                <div
                  key={d.key}
                  className="rounded-lg border border-border overflow-hidden"
                >
                  <Link
                    href={devUrl}
                    className="block p-4 transition hover:bg-muted/40"
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
                      {ports.length > 0
                        ? ` · ${ports.length} ported`
                        : " · 0 ported"}
                    </p>
                  </Link>

                  {ports.length > 0 && (
                    <div className="border-t border-border bg-muted/20">
                      {Array.from(groups).map(([groupLabel, pages]) => (
                        <details
                          key={groupLabel}
                          open
                          className="group border-b border-border last:border-b-0"
                        >
                          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2 text-sm font-semibold marker:hidden [&::-webkit-details-marker]:hidden">
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
                          <div className="grid gap-2 px-4 pb-3 pt-1">
                            {pages.map((p) => {
                              const newUrl = `http://${p.domain}.localhost:${port}${p.path}`;
                              const legacyUrl = `${LEGACY_LIVE_BASE}${p.legacyPath}`;
                              return (
                                <div
                                  key={`${p.domain}${p.path}`}
                                  className="rounded-md border border-border/60 bg-background p-3"
                                >
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                      <div className="font-medium">{p.label}</div>
                                      {p.notes && (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {p.notes}
                                        </p>
                                      )}
                                    </div>
                                    <CompareButton
                                      newUrl={newUrl}
                                      legacyUrl={legacyUrl}
                                    />
                                  </div>
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
                  )}
                </div>
              );
            })}
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
