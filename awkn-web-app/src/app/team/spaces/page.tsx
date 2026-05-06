import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import { spaces } from "~/server/db/schema";
import { getCurrentUser } from "~/lib/auth";
import { Button } from "~/components/ui/button";

/**
 * First real DB-backed page in the new app. Fetches live AWKN spaces from
 * prod via Drizzle and renders a small table. Phase 2.3 verification —
 * proves the stack reads prod end-to-end (proxy → server component →
 * Drizzle → Supabase pooler → prod Postgres).
 */
export default async function TeamSpacesPage() {
  const h = await headers();
  const path = h.get("x-matched-path") ?? "/team/spaces";
  const user = await getCurrentUser();

  let rows: Array<typeof spaces.$inferSelect> = [];
  let error: string | null = null;
  try {
    rows = await db
      .select()
      .from(spaces)
      .where(eq(spaces.isArchived, false))
      .limit(20);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="container max-w-5xl flex flex-col gap-6 py-12">
      <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground">
        <span>Admin BOS</span>
        <span>·</span>
        <span>{path}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary">
          <span className="h-1.5 w-1.5 rounded-full bg-primary" />
          live prod data
        </span>
      </div>

      <h1 className="text-4xl font-bold tracking-tight">Spaces</h1>
      <p className="text-muted-foreground">
        First real DB-backed page. Reads from prod Supabase via Drizzle.
      </p>

      <div className="flex items-center justify-between rounded-md border border-border bg-card/30 px-4 py-3 text-sm">
        {user ? (
          <>
            <span>
              Signed in as <strong>{user.email}</strong> · role{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                {user.role}
              </code>
              {user.appUser?.firstName && (
                <span className="text-muted-foreground">
                  {" "}
                  ({user.appUser.firstName} {user.appUser.lastName ?? ""})
                </span>
              )}
            </span>
            <form action="/auth/sign-out" method="post">
              <input type="hidden" name="next" value="/login" />
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </>
        ) : (
          <span className="text-muted-foreground">
            Not signed in (NEXT_PUBLIC_DISABLE_AUTH bypass active).
          </span>
        )}
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-semibold">Database query failed</p>
          <p className="mt-1 font-mono text-xs whitespace-pre-wrap">{error}</p>
          <p className="mt-2 text-xs">
            Most likely: <code>SUPABASE_DB_PASSWORD</code> in{" "}
            <code>.env.local</code> isn't set or is wrong.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          No active spaces.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-card text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Location</th>
                <th className="px-4 py-2 text-right">Nightly</th>
                <th className="px-4 py-2 text-right">Monthly</th>
                <th className="px-4 py-2 text-center">Listed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-card/50">
                  <td className="px-4 py-2 font-medium">{row.name}</td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.type ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {row.location ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.nightlyRate != null ? `$${row.nightlyRate}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {row.monthlyRate != null ? `$${row.monthlyRate}` : "—"}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {row.isListed ? "✓" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Showing up to 20 non-archived spaces. Real BOS port lands in Phase 6.
      </p>
    </div>
  );
}
