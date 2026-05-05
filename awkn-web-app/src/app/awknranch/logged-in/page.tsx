import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Button } from "~/components/ui/button";

/**
 * Post-login landing for the legacy /login flow. Confirms the user is
 * signed in (legacy supabase.js writes to localStorage[awkn-ranch-auth];
 * /team reads the same key) and gives them quick links to test pages
 * that rely on that session.
 */
export default function LoggedInPage() {
  return (
    <div className="container max-w-md flex flex-col gap-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Signed in ✓</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Your session lives in <code>localStorage</code> under{" "}
            <code>awkn-ranch-auth</code>. The <code>/team</code> page reads
            that same key, so it should recognize you as signed-in.
          </p>
          <div className="flex flex-col gap-2">
            <Button asChild>
              <Link href="/team">Go to /team</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Back to dev landing</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
