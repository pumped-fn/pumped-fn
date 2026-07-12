#!/usr/bin/env node

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  compareObservations,
  hashObject,
  loadManifest,
  parseArgs,
  readJson,
} from "./harness.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.output || !args.mode)
  throw new Error("compare requires --mode, inputs, and --output");
if (args["input-dir"] && args.input.length > 0)
  throw new Error("use --input-dir or repeated --input, not both");
if (args.pairs !== undefined && !args["input-dir"])
  throw new Error("--pairs requires --input-dir");
const pairCount = Number(args.pairs ?? 5);
if (![5, 9].includes(pairCount)) throw new Error("pairs must be 5 or 9");
const lanes =
  args.mode === "full"
    ? ["lite", "lite-react"]
    : args.mode === "lite-only"
    ? ["lite"]
    : [];
const order = Array.from({ length: pairCount }, (_, index) =>
  index % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"]
);
const inputPaths = args["input-dir"]
  ? lanes.flatMap((lane) =>
      order.flatMap((variants, pairIndex) =>
        variants.map((variant, positionIndex) =>
          resolve(
            args["input-dir"],
            `${pairIndex + 1}-${positionIndex + 1}-${variant}-${lane}.json`
          )
        )
      )
    )
  : args.input;
const comparison = compareObservations(
  inputPaths.map(readJson),
  args.mode,
  loadManifest()
);
const output = resolve(args.output);
const value = { ...comparison, comparison_sha256: hashObject(comparison) };
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(value, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({
    output,
    mode: value.mode,
    decision: value.decision,
    pair_count: value.pair_count,
    required_directional_agreement: value.required_directional_agreement,
    rows: value.row_count,
    regressions: value.performance_regression_case_count,
    evidence_gaps: value.performance_evidence_gap_count,
    representative_lane_ratio: value.representative_lane_ratio,
    comparison_sha256: value.comparison_sha256,
  })}\n`
);
if (
  value.performance_regression_case_count > 0 ||
  value.inconclusive_rows.length > 0
)
  process.exitCode = 2;
