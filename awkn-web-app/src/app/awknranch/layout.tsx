import { DomainNav } from "~/components/domain-nav";

export default function AwknRanchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DomainNav domain="awknranch" />
      <main className="min-h-screen">{children}</main>
    </>
  );
}
