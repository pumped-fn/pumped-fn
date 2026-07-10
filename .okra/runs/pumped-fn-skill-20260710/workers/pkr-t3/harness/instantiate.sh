#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
DKR5="$HERE/../../dkr-5/harness"
SOLUTION="${1:?usage: instantiate.sh <solution-dir with src,tests,bin> <target-workspace-dir>}"
TARGET="${2:?usage: instantiate.sh <solution-dir> <target-workspace-dir>}"
TARBALL="$DKR5/tarballs/pumped-fn-lite-4.0.0.tgz"
SCHED_TARBALL="$HERE/tarballs/pumped-fn-lite-extension-scheduler-0.2.0.tgz"
[ -f "$TARBALL" ] || { echo "pinned tarball missing: $TARBALL" >&2; exit 1; }
[ -f "$SCHED_TARBALL" ] || { echo "pinned tarball missing: $SCHED_TARBALL" >&2; exit 1; }
mkdir -p "$TARGET"
cp "$DKR5/workspace-template/vitest.config.ts" "$TARGET/"
sed 's|"types": \[\]|"types": ["node"]|' "$DKR5/workspace-template/tsconfig.json" > "$TARGET/tsconfig.json"
sed -e "s|PACK_TARBALL_LITE|$TARBALL|" -e 's|"t7-chess-rounds"|"t3-observatory"|' \
  -e 's|tsx bin/main.ts|tsx bin/daemon.ts|' \
  -e "s|\"@pumped-fn/lite\": \"file:$TARBALL\"|\"@pumped-fn/lite\": \"file:$TARBALL\",\n    \"@pumped-fn/lite-extension-scheduler\": \"file:$SCHED_TARBALL\"|" \
  -e 's|"tsx": "\^4.19.0",|"tsx": "^4.19.0",\n    "@types/node": "^22.0.0",|' \
  "$DKR5/workspace-template/package.json" > "$TARGET/package.json"
for part in src tests bin; do
  [ -d "$SOLUTION/$part" ] && cp -r "$SOLUTION/$part" "$TARGET/"
done
cp "$HERE/check-t3.mjs" "$TARGET/"
# --legacy-peer-deps: scheduler 0.2.0 declares peer @pumped-fn/lite ^3.1.0; the pinned lite tarball is 4.0.0
(cd "$TARGET" && npm install --no-audit --no-fund --legacy-peer-deps)
echo "workspace ready: $TARGET"
echo "gates:"
echo "  (cd $TARGET && node /home/lagz0ne/dev/pumped-fn/pkg/tool/lint/dist/cli.mjs --max-warnings 0 src bin tests)"
echo "  (cd $TARGET && npx tsgo --noEmit)"
echo "  (cd $TARGET && npx vitest run)"
echo "  (cd $TARGET && npx tsx bin/daemon.ts)"
echo "  (cd $TARGET && node --import tsx check-t3.mjs)"
