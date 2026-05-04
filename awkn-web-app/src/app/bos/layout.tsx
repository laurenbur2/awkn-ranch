import { DomainNav } from "~/components/domain-nav";

export default function BosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DomainNav domain="bos" />
      <main className="min-h-screen">{children}</main>
    </>
  );
}
