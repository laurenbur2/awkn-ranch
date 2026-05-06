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
 * legacy pages have been ported. AWKN-branded chrome to feel like an
 * internal tool, not a generic dev page.
 */
export default function DevLandingPage() {
  const port = process.env.PORT ?? "3000";
  const totalPorted = PORTED_PAGES.length;

  return (
    <>
      <link
        rel="preconnect"
        href="https://fonts.googleapis.com"
        precedence="default"
      />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
        precedence="default"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap"
        rel="stylesheet"
        precedence="default"
      />
      <style precedence="default" href="dev-landing-styles">{`
        .dev-page {
          --awkn-brown-dark: #3a2a1a;
          --awkn-brown: #6b4c2a;
          --awkn-brown-light: #a67c52;
          --awkn-cream: #f5f0e8;
          --awkn-cream-deep: #ebe3d2;
          --awkn-offwhite: #faf8f4;
          --awkn-white: #ffffff;
          --awkn-amber: #be7830;
          --awkn-border: rgba(58,42,26,0.10);
          --awkn-border-soft: rgba(58,42,26,0.06);
          --font-heading: 'Cormorant Garamond', Georgia, serif;
          --font-body: 'Montserrat', system-ui, sans-serif;
          background: var(--awkn-cream);
          font-family: var(--font-body);
          color: var(--awkn-brown-dark);
          min-height: 100vh;
          padding: 3rem 1.5rem 5rem;
        }
        .dev-shell {
          max-width: 56rem;
          margin: 0 auto;
          --awkn-brown-dark: #3a2a1a;
          --awkn-brown: #6b4c2a;
          --awkn-brown-light: #a67c52;
          --awkn-cream: #f5f0e8;
          --awkn-cream-deep: #ebe3d2;
          --awkn-offwhite: #faf8f4;
          --awkn-white: #ffffff;
          --awkn-amber: #be7830;
          --awkn-border: rgba(58,42,26,0.10);
          --awkn-border-soft: rgba(58,42,26,0.06);
          --font-heading: 'Cormorant Garamond', Georgia, serif;
          --font-body: 'Montserrat', system-ui, sans-serif;
        }

        .dev-header { text-align: center; margin-bottom: 3rem; }
        .dev-wordmark {
          display: block;
          width: 220px;
          height: auto;
          margin: 0 auto 1.5rem;
        }
        .dev-eyebrow {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: var(--awkn-brown-light);
        }
        .dev-headline {
          font-family: var(--font-heading);
          font-size: 2.25rem;
          font-weight: 400;
          color: var(--awkn-brown-dark);
          margin-top: 0.4rem;
          letter-spacing: 0.02em;
        }
        .dev-headline em { font-style: italic; color: var(--awkn-amber); }
        .dev-stat {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          margin-top: 1rem;
          padding: 0.4rem 0.875rem;
          background: var(--awkn-offwhite);
          border: 1px solid var(--awkn-border);
          border-radius: 999px;
          font-size: 12px;
          font-weight: 500;
          letter-spacing: 0.5px;
          color: var(--awkn-brown);
        }
        .dev-stat-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: var(--awkn-amber);
        }

        .dev-section-label {
          font-family: var(--font-heading);
          font-size: 1.1rem;
          font-style: italic;
          font-weight: 400;
          color: var(--awkn-brown);
          margin: 0 0 1.25rem;
          padding-bottom: 0.6rem;
          border-bottom: 1px solid var(--awkn-border-soft);
          letter-spacing: 0.02em;
        }
        .dev-section-label .count {
          font-family: var(--font-body);
          font-style: normal;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--awkn-brown-light);
          margin-left: 0.4rem;
        }

        .dev-domain-grid { display: grid; gap: 1rem; }

        .dev-domain {
          background: var(--awkn-offwhite);
          border: 1px solid var(--awkn-border);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 1px 2px rgba(58,42,26,0.04);
          transition: box-shadow 0.2s ease, border-color 0.2s ease;
        }
        .dev-domain:hover {
          box-shadow: 0 4px 16px rgba(58,42,26,0.08);
          border-color: rgba(58,42,26,0.18);
        }
        .dev-domain-head {
          display: block;
          padding: 1.25rem 1.5rem;
          text-decoration: none;
          color: inherit;
          transition: background 0.15s ease;
        }
        .dev-domain-head:hover { background: var(--awkn-cream); }
        .dev-domain-head-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .dev-domain-name {
          font-family: var(--font-heading);
          font-size: 1.5rem;
          font-weight: 500;
          color: var(--awkn-brown-dark);
          letter-spacing: 0.02em;
        }
        .dev-domain-host {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 11px;
          font-weight: 500;
          color: var(--awkn-brown-light);
          letter-spacing: 0.5px;
        }
        .dev-domain-desc {
          margin-top: 0.4rem;
          font-size: 13px;
          line-height: 1.5;
          color: var(--awkn-brown);
        }
        .dev-domain-meta {
          margin-top: 0.65rem;
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }
        .dev-meta-pill {
          display: inline-block;
          padding: 0.18rem 0.625rem;
          background: var(--awkn-cream);
          border-radius: 999px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--awkn-brown);
        }
        .dev-meta-pill.amber {
          background: rgba(212,136,58,0.12);
          color: var(--awkn-amber);
        }
        .dev-meta-pill.ghost {
          background: transparent;
          color: var(--awkn-brown-light);
        }

        .dev-groups {
          border-top: 1px solid var(--awkn-border-soft);
          background: rgba(245,240,232,0.4);
        }
        .dev-group {
          border-bottom: 1px solid var(--awkn-border-soft);
        }
        .dev-group:last-child { border-bottom: 0; }
        .dev-group summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1.5rem;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--awkn-brown);
          cursor: pointer;
          list-style: none;
        }
        .dev-group summary::-webkit-details-marker { display: none; }
        .dev-group summary:hover { background: var(--awkn-cream); color: var(--awkn-brown-dark); }
        .dev-group .count {
          font-weight: 500;
          color: var(--awkn-brown-light);
          margin-left: 0.4rem;
        }
        .dev-group-arrow {
          font-size: 11px;
          transition: transform 0.2s ease;
          color: var(--awkn-brown-light);
        }
        .dev-group[open] .dev-group-arrow { transform: rotate(90deg); }

        .dev-pages {
          padding: 0.5rem 1.5rem 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }
        .dev-page-card {
          background: var(--awkn-white);
          border: 1px solid var(--awkn-border-soft);
          border-radius: 10px;
          padding: 0.875rem 1rem;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }
        .dev-page-card:hover {
          border-color: var(--awkn-border);
          box-shadow: 0 2px 8px rgba(58,42,26,0.05);
        }
        .dev-page-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.875rem;
        }
        .dev-page-label {
          font-family: var(--font-heading);
          font-size: 1rem;
          font-weight: 500;
          color: var(--awkn-brown-dark);
          line-height: 1.2;
        }
        .dev-page-notes {
          margin-top: 0.3rem;
          font-size: 12px;
          line-height: 1.5;
          color: var(--awkn-brown);
        }
        .dev-page-links {
          margin-top: 0.625rem;
          display: flex;
          flex-wrap: wrap;
          gap: 1rem;
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 11px;
        }
        .dev-link-new {
          color: var(--awkn-amber);
          text-decoration: none;
          letter-spacing: 0.3px;
        }
        .dev-link-new:hover {
          color: var(--awkn-brown-dark);
          text-decoration: underline;
        }
        .dev-link-legacy {
          color: var(--awkn-brown-light);
          text-decoration: none;
          letter-spacing: 0.3px;
        }
        .dev-link-legacy:hover {
          color: var(--awkn-brown);
          text-decoration: underline;
        }

        .dev-footer {
          margin-top: 3rem;
          padding-top: 1.5rem;
          border-top: 1px solid var(--awkn-border-soft);
          text-align: center;
          font-size: 11px;
          letter-spacing: 0.3px;
          color: var(--awkn-brown-light);
          line-height: 1.7;
        }
        .dev-footer code {
          font-family: ui-monospace, "SF Mono", Menlo, monospace;
          font-size: 11px;
          padding: 0.15rem 0.4rem;
          background: var(--awkn-cream);
          border-radius: 4px;
          color: var(--awkn-brown);
        }
      `}</style>

      <main className="dev-page">
        <div className="dev-shell">
          <header className="dev-header">
            <img
              src="/branding/wordmark-black-transparent.png"
              alt="AWKN"
              className="dev-wordmark"
            />
            <div className="dev-eyebrow">Web App · Development</div>
            <h1 className="dev-headline">
              Multi-domain port <em>console</em>
            </h1>
            <div className="dev-stat">
              <span className="dev-stat-dot" />
              {totalPorted} pages ported across {DOMAINS.length} domains
            </div>
          </header>

          <section>
            <h2 className="dev-section-label">
              Domains
              <span className="count">{DOMAINS.length}</span>
            </h2>
            <div className="dev-domain-grid">
              {DOMAINS.map((d) => {
                const devUrl = `http://${d.key}.localhost:${port}`;
                const ports = portedPagesFor(d.key as PortDomain);
                const groups = groupByLabel(ports);
                return (
                  <div key={d.key} className="dev-domain">
                    <Link href={devUrl} className="dev-domain-head">
                      <div className="dev-domain-head-row">
                        <span className="dev-domain-name">{d.label}</span>
                        <span className="dev-domain-host">
                          {d.key}.localhost:{port}
                        </span>
                      </div>
                      <p className="dev-domain-desc">{d.description}</p>
                      <div className="dev-domain-meta">
                        <span className="dev-meta-pill ghost">
                          Prod: {d.prodHosts.join(", ")}
                        </span>
                        {d.authRequired && (
                          <span className="dev-meta-pill">Auth required</span>
                        )}
                        <span
                          className={
                            ports.length > 0
                              ? "dev-meta-pill amber"
                              : "dev-meta-pill ghost"
                          }
                        >
                          {ports.length > 0
                            ? `${ports.length} ported`
                            : "0 ported"}
                        </span>
                      </div>
                    </Link>

                    {ports.length > 0 && (
                      <div className="dev-groups">
                        {Array.from(groups).map(([groupLabel, pages]) => (
                          <details key={groupLabel} className="dev-group">
                            <summary>
                              <span>
                                {groupLabel}
                                <span className="count">({pages.length})</span>
                              </span>
                              <span className="dev-group-arrow">›</span>
                            </summary>
                            <div className="dev-pages">
                              {pages.map((p) => {
                                const newUrl = `http://${p.domain}.localhost:${port}${p.path}`;
                                const legacyUrl = `${LEGACY_LIVE_BASE}${p.legacyPath}`;
                                return (
                                  <div
                                    key={`${p.domain}${p.path}`}
                                    className="dev-page-card"
                                  >
                                    <div className="dev-page-row">
                                      <div style={{ minWidth: 0, flex: 1 }}>
                                        <div className="dev-page-label">
                                          {p.label}
                                        </div>
                                        {p.notes && (
                                          <p className="dev-page-notes">
                                            {p.notes}
                                          </p>
                                        )}
                                      </div>
                                      <CompareButton
                                        newUrl={newUrl}
                                        legacyUrl={legacyUrl}
                                      />
                                    </div>
                                    <div className="dev-page-links">
                                      <Link
                                        href={newUrl}
                                        className="dev-link-new"
                                      >
                                        ↳ new · {p.path}
                                      </Link>
                                      <a
                                        href={legacyUrl}
                                        target="_blank"
                                        rel="noopener"
                                        className="dev-link-legacy"
                                      >
                                        ↳ legacy · {p.legacyPath}
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

          <footer className="dev-footer">
            Tip — set <code>NEXT_PUBLIC_DISABLE_AUTH=true</code> in{" "}
            <code>.env.local</code> to bypass auth on team / portal during dev.
          </footer>
        </div>
      </main>
    </>
  );
}
