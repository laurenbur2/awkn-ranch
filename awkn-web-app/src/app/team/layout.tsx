import { DomainNav } from "~/components/domain-nav";

export default function TeamLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-awkn min-h-screen bg-background text-foreground">
      <DomainNav domain="team" />
      <main>{children}</main>
    </div>
  );
}
