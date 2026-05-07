#!/bin/bash
# Mirror legacy spaces/admin/*.js into awkn-web-app/public/spaces/admin/
# so the new app's serveLegacyHtml routes serve up-to-date JS.
#
# Run after editing any legacy admin JS file. Idempotent.
#
# Usage: ./scripts/sync-bos-mirror.sh

set -e

SRC=spaces/admin
DST=awkn-web-app/public/spaces/admin

if [ ! -d "$SRC" ]; then
  echo "ERROR: $SRC not found — run from repo root"
  exit 1
fi

if [ ! -d "$DST" ]; then
  echo "ERROR: $DST not found — run from repo root"
  exit 1
fi

# Only sync files that exist in BOTH source and destination.
# Adding new files requires deliberate scoping, not a blanket sync.
synced=0
for src_file in "$SRC"/*.js; do
  fname=$(basename "$src_file")
  dst_file="$DST/$fname"
  if [ -f "$dst_file" ]; then
    if ! cmp -s "$src_file" "$dst_file"; then
      cp "$src_file" "$dst_file"
      echo "  synced: $fname"
      synced=$((synced + 1))
    fi
  fi
done

echo "Mirrored $synced file(s) from $SRC → $DST"
