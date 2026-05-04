import { DomainNav } from "~/components/domain-nav";

export default function WithinLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <DomainNav domain="within" />
      <main className="min-h-screen">{children}</main>
    </>
  );
}
