export default function BosHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="container max-w-2xl flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          bos.awknranch.com
        </p>
        <h1 className="text-5xl font-bold tracking-tight">Admin BOS</h1>
        <p className="text-lg text-muted-foreground">
          Internal Business Operating System — CRM, scheduling, accounting,
          agreements.
        </p>
        <p className="mt-8 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Phase 2.1 stub. Auth gate is wired but bypassed when{" "}
          <code className="font-mono">NEXT_PUBLIC_DISABLE_AUTH=true</code>.
          Page-by-page port from legacy <code>spaces/admin/</code> happens in
          Phase 6.
        </p>
      </div>
    </main>
  );
}
