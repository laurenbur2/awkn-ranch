import { DomainNav } from "~/components/domain-nav";

export default function AwknRanchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-awkn min-h-screen bg-background text-foreground">
      <DomainNav domain="awknranch" />
      <main>{children}</main>
    </div>
  );
}
