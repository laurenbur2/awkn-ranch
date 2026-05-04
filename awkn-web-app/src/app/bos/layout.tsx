import { DomainNav } from "~/components/domain-nav";

export default function BosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-awkn min-h-screen bg-background text-foreground">
      <DomainNav domain="bos" />
      <main>{children}</main>
    </div>
  );
}
