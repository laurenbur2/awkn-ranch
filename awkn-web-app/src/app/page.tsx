import Link from "next/link";
import { DOMAINS } from "~/lib/domains";

/**
 * Dev landing page — shown when visiting bare `localhost:3000`.
 *
 * In production middleware rewrites every request based on hostname, so this
 * page only appears during local development as a navigation aid for clicking
 * into each domain.
 */
export default function DevLandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="container max-w-2xl flex flex-col gap-8">
        <header>
          <h1 className="text-4xl font-bold tracking-tight">awkn-web-app</h1>
          <p className="mt-2 text-lg text-muted-foreground">
            Multi-domain Next.js app — dev landing
          </p>
        </header>

        <section className="grid gap-4">
          {DOMAINS.map((d) => {
            const port = process.env.PORT ?? "3000";
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
