#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DKR5="$HERE/../../dkr-5/harness"
SOLUTION="${1:?usage: instantiate-t4.sh <solution-dir with src,tests,bin> <target-workspace-dir>}"
TARGET="${2:?usage: instantiate-t4.sh <solution-dir> <target-workspace-dir>}"
TARBALL="$DKR5/tarballs/pumped-fn-lite-4.0.0.tgz"
mkdir -p "$TARGET"
cp "$DKR5/workspace-template/vitest.config.ts" "$TARGET/"
cp "$HERE/workspace-template/tsconfig.json" "$TARGET/"
sed "s|PACK_TARBALL_LITE|$TARBALL|" "$HERE/workspace-template/package.json" > "$TARGET/package.json"
for part in src tests bin; do
  [ -d "$SOLUTION/$part" ] && cp -r "$SOLUTION/$part" "$TARGET/"
done
cp "$HERE/check-t4.mjs" "$TARGET/"
(cd "$TARGET" && npm install --no-audit --no-fund)
echo "workspace ready: $TARGET"
