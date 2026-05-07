#!/bin/bash
# Sync the bundled-in legacy/ directory from a parent legacy GH-Pages
# repo. Designed for the post-repo-split world where awkn-web-app lives
# in its own GitHub repo + Vercel project, but Lauren and Justin still
# edit content in the original laurenbur2/awkn-ranch repo (which serves
# awknranch.com via GitHub Pages).
#
# Usage:
#   ./scripts/sync-legacy.sh                    # sync from sibling dir
#   ./scripts/sync-legacy.sh /path/to/legacy   # sync from explicit path
#
# What it copies (the 20 paths that serveLegacyHtml + a few direct reads
# touch at runtime):
#   admin/  book/  contact/  events/  host-a-retreat/  index.html
#   investor/  investor-presentation/  login/  operations/  portal/
#   pricing/  property/  retreat/  schedule/  services/  spaces/
#   team/  within/  within-center/
#
# After running, commit the changes:
#   git add legacy/ && git commit -m "chore(legacy): sync from upstream"
#
# Idempotent — re-running with no upstream changes is a no-op.

set -e

# Default to ../legacy (post-restructure layout — legacy site content
# lives under <repo-root>/legacy/, awkn-web-app is a sibling). Override
# with first arg for post-split layout when the legacy repo is at a
# different absolute path.
SRC="${1:-../legacy}"

# Resolve to absolute for clearer logs
SRC=$(cd "$SRC" 2>/dev/null && pwd) || {
  echo "ERROR: source directory not found: $1"
  echo "Usage: $0 [/path/to/legacy/repo/root]"
  exit 1
}

DST="$(pwd)/legacy"

if [ ! -d "$DST" ]; then
  echo "ERROR: $DST not found — run from awkn-web-app/ root"
  exit 1
fi

PATHS=(
  admin book contact events host-a-retreat
  investor investor-presentation login operations portal
  pricing property retreat schedule services
  spaces team within within-center
  index.html
)

echo "Syncing from $SRC → $DST"
synced=0
for p in "${PATHS[@]}"; do
  src_path="$SRC/$p"
  dst_path="$DST/$p"

  if [ ! -e "$src_path" ]; then
    echo "  SKIP: $p (not in source)"
    continue
  fi

  # Use rsync if available (cleaner diffs); fall back to cp -R
  if command -v rsync >/dev/null 2>&1; then
    if [ -d "$src_path" ]; then
      rsync -a --delete "$src_path/" "$dst_path/"
    else
      rsync -a "$src_path" "$dst_path"
    fi
  else
    rm -rf "$dst_path"
    cp -R "$src_path" "$dst_path"
  fi
  synced=$((synced + 1))
  echo "  ✓ $p"
done

echo
echo "Synced $synced paths."
echo "Total size: $(du -sh "$DST" | awk '{print $1}')"
echo
echo "Next: review with \`git status legacy/\` then commit if changes look right."
