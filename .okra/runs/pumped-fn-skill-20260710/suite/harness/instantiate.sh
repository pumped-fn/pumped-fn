#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SUITE="$(cd "$HERE/.." && pwd)"
TASK_ID="${1:?usage: instantiate.sh <task-id e.g. T-3> <solution-dir with src,tests,bin> <target-workspace-dir>}"
SOLUTION="${2:?usage: instantiate.sh <task-id> <solution-dir> <target-workspace-dir>}"
TARGET="${3:?usage: instantiate.sh <task-id> <solution-dir> <target-workspace-dir>}"
TASK_DIR="$SUITE/tasks/$TASK_ID"
[ -d "$TASK_DIR" ] || { echo "UNKNOWN_TASK: $TASK_ID" >&2; exit 2; }
LITE="$HERE/tarballs/pumped-fn-lite-4.0.0.tgz"
LINT="$HERE/tarballs/pumped-fn-lite-lint-1.0.0.tgz"
SCHED="$HERE/tarballs/pumped-fn-lite-extension-scheduler-0.2.0.tgz"
for t in "$LITE" "$LINT"; do
  [ -f "$t" ] || { echo "MISSING_TARBALL: $t" >&2; exit 2; }
done
mkdir -p "$TARGET"
cp "$HERE/workspace-template-v2/tsconfig.json" "$HERE/workspace-template-v2/vitest.config.ts" "$TARGET/"
node -e '
  const fs = require("fs")
  const [template, extraPath, lite, lint, sched, out] = process.argv.slice(1)
  const pkg = JSON.parse(fs.readFileSync(template, "utf8").replace("PACK_TARBALL_LITE", lite).replace("PACK_TARBALL_LINT", lint))
  const extra = JSON.parse(fs.readFileSync(extraPath, "utf8"))
  Object.assign(pkg.dependencies, extra.deps ?? {})
  for (const tb of extra.tarballs ?? []) {
    if (tb === "scheduler") pkg.dependencies["@pumped-fn/lite-extension-scheduler"] = "file:" + sched
    else { console.error("UNKNOWN_TARBALL_KEY: " + tb); process.exit(2) }
  }
  fs.writeFileSync(out, JSON.stringify(pkg, null, 2) + "\n")
' "$HERE/workspace-template-v2/package.json" "$TASK_DIR/extra-deps.json" "$LITE" "$LINT" "$SCHED" "$TARGET/package.json"
for part in src tests bin; do
  [ -d "$SOLUTION/$part" ] && cp -r "$SOLUTION/$part" "$TARGET/"
done
cp "$TASK_DIR/check.mjs" "$TARGET/"
NPM_FLAGS="$(node -e 'console.log((JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).npmFlags ?? []).join(" "))' "$TASK_DIR/extra-deps.json")"
(cd "$TARGET" && npm install --no-audit --no-fund $NPM_FLAGS)
echo "workspace ready: $TARGET"
