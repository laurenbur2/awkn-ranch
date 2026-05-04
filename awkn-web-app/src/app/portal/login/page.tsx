import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { LoginForm } from "~/components/login-form";

export default function PortalLoginPage() {
  return (
    <div className="container max-w-md flex flex-col gap-6 py-16">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>
            Access your bookings, payments, and documents
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm redirectTo="/" />
        </CardContent>
      </Card>
      <p className="text-center text-xs text-muted-foreground">
        Phase 2.4 stub. Final portal login design lands with the Phase 5
        client portal MVP.
      </p>
    </div>
  );
}
