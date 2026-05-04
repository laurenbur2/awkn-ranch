export default function WithinHome() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="container max-w-2xl flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          within.center
        </p>
        <h1 className="text-5xl font-bold tracking-tight">Within Center</h1>
        <p className="text-lg text-muted-foreground">
          Clinical brand — ketamine retreats and inpatient stays.
        </p>
        <p className="mt-8 rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          Phase 2.1 stub. Marketing + blog routes scaffolded in Phase 2.2;
          real content + SEO triage land in Phase 4.
        </p>
      </div>
    </main>
  );
}
