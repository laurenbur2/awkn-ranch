/**
 * Bare layout for the (internal) route group — pages here bring their own
 * fonts/styles and don't share chrome with the rest of awknranch (no
 * DomainNav, no theme wrapper). Existing routes under this group are mostly
 * Route Handlers (which bypass layouts entirely); this layout matters only
 * for page.tsx-based routes like /logged-in.
 */
export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
