import { DomainNav } from "~/components/domain-nav";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DomainNav domain="portal" />
      <main className="min-h-screen">{children}</main>
    </>
  );
}
