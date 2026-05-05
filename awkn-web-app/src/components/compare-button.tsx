"use client";

interface CompareButtonProps {
  newUrl: string;
  legacyUrl: string;
}

/**
 * Opens the new (ported) and legacy (live GH-Pages) URLs in two new tabs
 * back-to-back. Both `window.open` calls run inside the same user gesture so
 * the second isn't popup-blocked. Used on the dev landing for side-by-side
 * visual-parity comparison while porting.
 */
export function CompareButton({ newUrl, legacyUrl }: CompareButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        window.open(newUrl, "_blank", "noopener");
        window.open(legacyUrl, "_blank", "noopener");
      }}
      className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs font-medium text-foreground transition hover:bg-muted/40"
    >
      ⇄ Compare
    </button>
  );
}
