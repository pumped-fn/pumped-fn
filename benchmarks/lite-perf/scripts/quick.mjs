#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "./harness.mjs";

const args = parseArgs(process.argv.slice(2));
for (const key of ["baseline-root", "candidate-root", "output-dir"]) {
  if (typeof args[key] !== "string" || args[key].length === 0)
    throw new Error(`missing --${key}`);
}

const benchmarkRoot = resolve(import.meta.dirname, "..");
const capture = resolve(import.meta.dirname, "capture.mjs");
const compare = resolve(import.meta.dirname, "compare.mjs");
const outputDir = resolve(args["output-dir"]);
if (existsSync(outputDir)) throw new Error(`output already exists: ${outputDir}`);
mkdirSync(outputDir, { recursive: true });

for (const [position, variant] of ["baseline", "candidate"].entries()) {
  const root = resolve(args[`${variant}-root`]);
  const env = {
    ...process.env,
    PUMPED_PERF_LITE_DIST: resolve(root, "pkg/core/lite/dist/index.mjs"),
    PUMPED_PERF_LITE_PACKAGE: resolve(root, "pkg/core/lite/package.json"),
    PUMPED_PERF_LITE_REACT_DIST: resolve(root, "pkg/react/lite-react/dist/index.mjs"),
    PUMPED_PERF_LITE_REACT_PACKAGE: resolve(root, "pkg/react/lite-react/package.json"),
  };
  for (const lane of ["lite", "lite-react"]) {
    run(capture, [
      "--lane",
      lane,
      "--variant",
      variant,
      "--pair",
      "1",
      "--position",
      String(position + 1),
      "--output",
      resolve(outputDir, `1-${position + 1}-${variant}-${lane}.json`),
    ], env);
  }
}

run(compare, [
  "--mode",
  "full",
  "--input-dir",
  outputDir,
  "--pairs",
  "1",
  "--floor",
  String(args.floor ?? 0.95),
  "--output",
  resolve(outputDir, "comparison.json"),
]);

function run(script, nextArgs, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...nextArgs], {
    cwd: benchmarkRoot,
    encoding: "utf8",
    env,
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
