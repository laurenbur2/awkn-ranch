/**
 * Bare layout for the team `(internal)` route group — pages here bring
 * their own fonts/styles and don't share chrome with the rest of the team
 * surface (no DomainNav, no theme wrapper). Mirrors the awknranch
 * (internal) pattern. Mostly hosts Route Handlers (which bypass layouts
 * entirely); matters for any page.tsx-based routes like /logged-in.
 */
export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
