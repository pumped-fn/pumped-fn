#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SOLUTION="${1:?usage: instantiate.sh <solution-dir with src,tests,bin> <target-workspace-dir>}"
TARGET="${2:?usage: instantiate.sh <solution-dir> <target-workspace-dir>}"
TARBALL="$HERE/tarballs/pumped-fn-lite-4.0.0.tgz"
[ -f "$TARBALL" ] || "$HERE/pack-deps.sh"
mkdir -p "$TARGET"
cp "$HERE/workspace-template/tsconfig.json" "$HERE/workspace-template/vitest.config.ts" "$TARGET/"
sed "s|PACK_TARBALL_LITE|$TARBALL|" "$HERE/workspace-template/package.json" > "$TARGET/package.json"
for part in src tests bin; do
  [ -d "$SOLUTION/$part" ] && cp -r "$SOLUTION/$part" "$TARGET/"
done
cp "$HERE/check-t7.mjs" "$TARGET/"
(cd "$TARGET" && npm install --no-audit --no-fund)
echo "workspace ready: $TARGET"
echo "gates:"
echo "  (cd $TARGET && node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests)"
echo "  (cd $TARGET && npx tsgo --noEmit)"
echo "  (cd $TARGET && npx vitest run)"
echo "  (cd $TARGET && npx tsx bin/main.ts)"
echo "  (cd $TARGET && node --import tsx check-t7.mjs)"
