export default function AwknRanchHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="container max-w-2xl flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          awknranch.com
        </p>
        <h1 className="text-5xl font-bold tracking-tight">AWKN Ranch</h1>
        <p className="text-lg text-muted-foreground">
          Austin retreat property — day passes, memberships, retreats, events.
        </p>
        <p className="mt-8 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Phase 2.1 stub. Marketing pages get scaffolded in Phase 2.2;
          real content lands in Phase 3.
        </p>
      </div>
    </main>
  );
}
