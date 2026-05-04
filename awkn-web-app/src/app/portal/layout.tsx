import { DomainNav } from "~/components/domain-nav";

/**
 * Portal layout — defaults to AWKN theme. Phase 5 will switch dynamically
 * based on the logged-in client's brand context (Ranch vs Within).
 */
export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-awkn min-h-screen bg-background text-foreground">
      <DomainNav domain="portal" />
      <main>{children}</main>
    </div>
  );
}
