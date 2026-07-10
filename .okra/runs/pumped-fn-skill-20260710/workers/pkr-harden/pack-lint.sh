#!/usr/bin/env bash
set -euo pipefail
MAIN="${MAIN_CHECKOUT:-/home/lagz0ne/dev/pumped-fn}"
OUT="$(cd "$(dirname "$0")" && pwd)/tarballs"
mkdir -p "$OUT"
PKG="$MAIN/pkg/tool/lint"
if [ ! -f "$PKG/dist/cli.mjs" ]; then
  echo "MISSING_DIST: $PKG/dist/cli.mjs — do not rebuild; hand back" >&2
  exit 2
fi
if node -e "const s=require('$PKG/package.json').scripts||{}; process.exit(s.prepack||s.prepare||s.prepublishOnly ? 1 : 0)"; then
  :
else
  echo "LIFECYCLE_SCRIPT_PRESENT: pack would trigger a build — hand back" >&2
  exit 3
fi
(cd "$PKG" && pnpm pack --out "$OUT/pumped-fn-lite-lint-1.0.0.tgz" >/dev/null)
sha256sum "$OUT"/pumped-fn-lite-lint-*.tgz
