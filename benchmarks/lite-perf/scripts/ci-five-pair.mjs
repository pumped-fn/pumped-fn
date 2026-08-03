#!/usr/bin/env node

import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"

const repo = resolve(import.meta.dirname, "../../..")
const baseline = mkdtempSync(join(tmpdir(), "lite-perf-baseline-"))
const output = resolve(repo, "playground/compare/dist-pages/lite-performance-five-pair")
const commit = "c59d70dd133b8582eb375e7410dd7f379c12b3ce"

try {
  run("git", ["fetch", "--depth=1", "origin", commit])
  run("git", ["worktree", "add", "--detach", baseline, commit])
  run("pnpm", ["--dir", baseline, "install", "--frozen-lockfile"])
  run("pnpm", ["--dir", baseline, "--filter", "@pumped-fn/lite", "build"])
  run("pnpm", ["--dir", baseline, "--filter", "@pumped-fn/lite-react", "build"])
  run("pnpm", ["--filter", "@pumped-fn/lite", "build"])
  run("pnpm", ["--filter", "@pumped-fn/lite-react", "build"])
  mkdirSync(output, { recursive: true })

  for (let pair = 1; pair <= 5; pair++) {
    const variants = pair % 2 === 1 ? ["baseline", "candidate"] : ["candidate", "baseline"]
    for (const lane of ["lite", "lite-react"]) {
      for (let position = 1; position <= 2; position++) {
        const variant = variants[position - 1]
        const root = variant === "baseline" ? baseline : repo
        run(process.execPath, [
          resolve(repo, "benchmarks/lite-perf/scripts/capture.mjs"),
          "--lane", lane,
          "--variant", variant,
          "--pair", String(pair),
          "--position", String(position),
          "--output", resolve(output, `${pair}-${position}-${variant}-${lane}.json`),
        ], {
          ...process.env,
          PUMPED_PERF_LITE_DIST: resolve(root, "pkg/core/lite/dist/index.mjs"),
          PUMPED_PERF_LITE_PACKAGE: resolve(root, "pkg/core/lite/package.json"),
          PUMPED_PERF_LITE_REACT_DIST: resolve(root, "pkg/react/lite-react/dist/index.mjs"),
          PUMPED_PERF_LITE_REACT_PACKAGE: resolve(root, "pkg/react/lite-react/package.json"),
        })
      }
    }
  }

  const result = spawnSync(process.execPath, [
    resolve(repo, "benchmarks/lite-perf/scripts/compare.mjs"),
    "--mode", "full",
    "--input-dir", output,
    "--pairs", "5",
    "--floor", "0.95",
    "--output", resolve(output, "comparison.json"),
  ], { cwd: repo, encoding: "utf8" })
  process.stdout.write(result.stdout)
  process.stderr.write(result.stderr)
  if (result.error) throw result.error
  if (result.status !== 0 && result.status !== 2) process.exit(result.status ?? 1)
} finally {
  spawnSync("git", ["worktree", "remove", "--force", baseline], { cwd: repo })
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: repo, stdio: "inherit", env })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}
