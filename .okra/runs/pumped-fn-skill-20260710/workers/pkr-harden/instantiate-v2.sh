#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SOLUTION="${1:?usage: instantiate-v2.sh <solution-dir with src,tests,bin> <target-workspace-dir> [checker.mjs]}"
TARGET="${2:?usage: instantiate-v2.sh <solution-dir> <target-workspace-dir> [checker.mjs]}"
CHECKER="${3:-}"
LITE="$HERE/tarballs/pumped-fn-lite-4.0.0.tgz"
LINT="$HERE/tarballs/pumped-fn-lite-lint-1.0.0.tgz"
[ -f "$LINT" ] || "$HERE/pack-lint.sh"
[ -f "$LITE" ] || { echo "MISSING_TARBALL: $LITE" >&2; exit 2; }
mkdir -p "$TARGET"
cp "$HERE/workspace-template-v2/tsconfig.json" "$HERE/workspace-template-v2/vitest.config.ts" "$TARGET/"
sed -e "s|PACK_TARBALL_LITE|$LITE|" -e "s|PACK_TARBALL_LINT|$LINT|" \
  "$HERE/workspace-template-v2/package.json" > "$TARGET/package.json"
for part in src tests bin; do
  [ -d "$SOLUTION/$part" ] && cp -r "$SOLUTION/$part" "$TARGET/"
done
[ -n "$CHECKER" ] && cp "$CHECKER" "$TARGET/"
(cd "$TARGET" && npm install --no-audit --no-fund)
echo "workspace ready: $TARGET"
