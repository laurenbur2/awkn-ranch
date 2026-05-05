/**
 * Bare layout for the (internal) route group — pages here bring their own
 * fonts/styles and don't share chrome with the rest of within (no DomainNav,
 * no theme wrapper). All within ports are Route Handlers (which bypass
 * layouts entirely); this layout exists for parity with the awknranch
 * (internal) group and future page.tsx-based routes.
 */
export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
