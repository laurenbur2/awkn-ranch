import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { LoginForm } from "~/components/login-form";

export default function BosLoginPage() {
  return (
    <div className="container max-w-md flex flex-col gap-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Admin Sign In</CardTitle>
          <CardDescription>
            AWKN Business Operating System
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm redirectTo="/" />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Phase 2.4 stub. Real legacy login UI (brown palette, Cormorant
        Garamond) gets ported in Phase 6.
      </p>
    </div>
  );
}
