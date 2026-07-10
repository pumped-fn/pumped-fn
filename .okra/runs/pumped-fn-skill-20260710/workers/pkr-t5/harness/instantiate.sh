#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DKR5="$HERE/../../dkr-5/harness"
SOLUTION="${1:?usage: instantiate.sh <solution-dir with src,tests,bin> <target-workspace-dir>}"
TARGET="${2:?usage: instantiate.sh <solution-dir> <target-workspace-dir>}"
TARBALL="$DKR5/tarballs/pumped-fn-lite-4.0.0.tgz"
[ -f "$TARBALL" ] || { echo "pinned tarball missing: $TARBALL" >&2; exit 1; }
mkdir -p "$TARGET"
cp "$DKR5/workspace-template/vitest.config.ts" "$TARGET/"
sed 's|"types": \[\]|"types": ["node"]|' "$DKR5/workspace-template/tsconfig.json" > "$TARGET/tsconfig.json"
sed -e "s|PACK_TARBALL_LITE|$TARBALL|" -e 's|"t7-chess-rounds"|"t5-recipe-export"|' \
  -e 's|tsx bin/main.ts|tsx bin/export.ts|' \
  -e 's|"tsx": "\^4.19.0",|"tsx": "^4.19.0",\n    "@types/node": "^22.0.0",|' \
  "$DKR5/workspace-template/package.json" > "$TARGET/package.json"
for part in src tests bin; do
  [ -d "$SOLUTION/$part" ] && cp -r "$SOLUTION/$part" "$TARGET/"
done
cp "$HERE/check-t5.mjs" "$TARGET/"
(cd "$TARGET" && npm install --no-audit --no-fund)
echo "workspace ready: $TARGET"
echo "gates:"
echo "  (cd $TARGET && node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests)"
echo "  (cd $TARGET && npx tsgo --noEmit)"
echo "  (cd $TARGET && npx vitest run)"
echo "  (cd $TARGET && npx tsx bin/export.ts)"
echo "  (cd $TARGET && node --import tsx check-t5.mjs)"
