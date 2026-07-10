#!/usr/bin/env bash
set -euo pipefail
MAIN="${MAIN_CHECKOUT:-/home/lagz0ne/dev/pumped-fn}"
OUT="$(cd "$(dirname "$0")" && pwd)/tarballs"
mkdir -p "$OUT"
if [ ! -f "$MAIN/pkg/core/lite/dist/index.mjs" ]; then
  echo "MISSING_DIST: $MAIN/pkg/core/lite/dist/index.mjs — do not rebuild; hand back" >&2
  exit 2
fi
(cd "$MAIN/pkg/core/lite" && npm pack --pack-destination "$OUT" >/dev/null)
sha256sum "$OUT"/*.tgz
