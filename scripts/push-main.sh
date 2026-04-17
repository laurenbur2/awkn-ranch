#!/bin/bash
# push-main.sh — bump version locally, then push to main.
#
# Usage: ./scripts/push-main.sh
#
# Flow: pull --rebase → bump version (offline mode) → commit bump → push.
# Version is bumped LOCALLY, never in CI. See docs/HANDOFF-github-ban-root-cause.md
# for why: GitHub Actions must not call external services.

set -euo pipefail

BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ "$BRANCH" != "main" ]; then
  echo "Not on main. Current branch: $BRANCH" >&2
  exit 1
fi

git pull --rebase origin main

npm run bump

if ! git diff --quiet -- version.json '*.html' 2>/dev/null; then
  git add version.json
  git add -- '*.html' 2>/dev/null || true
  git commit -m "chore: bump version"
fi

git push origin main
echo "Pushed."
