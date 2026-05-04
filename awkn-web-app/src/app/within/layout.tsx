import { DomainNav } from "~/components/domain-nav";

export default function WithinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-within min-h-screen bg-background text-foreground">
      <DomainNav domain="within" />
      <main>{children}</main>
    </div>
  );
}
