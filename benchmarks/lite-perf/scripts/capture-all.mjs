#!/usr/bin/env node

import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { packageRoot, parseArgs } from "./harness.mjs";

const args = parseArgs(process.argv.slice(2));
for (const key of ["variant", "pair", "position", "output-dir"]) {
  if (typeof args[key] !== "string" || args[key].length === 0)
    throw new Error(`missing --${key}`);
}
const outputDir = resolve(args["output-dir"]);
mkdirSync(outputDir, { recursive: true });
for (const lane of ["lite", "lite-react"]) {
  const output = resolve(
    outputDir,
    `${args.pair}-${args.position}-${args.variant}-${lane}.json`
  );
  const result = spawnSync(
    process.execPath,
    [
      resolve(packageRoot, "scripts/capture.mjs"),
      "--lane",
      lane,
      "--variant",
      args.variant,
      "--pair",
      args.pair,
      "--position",
      args.position,
      "--output",
      output,
    ],
    { cwd: packageRoot, stdio: "inherit", env: process.env }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
