#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectArtifact,
  collectEnvironment,
  extractRows,
  loadManifest,
  packageRoot,
  parseArgs,
  sealObservation,
  sha256File,
  validatePackedDistMarkers,
  validateObservation,
} from "./harness.mjs";

const args = parseArgs(process.argv.slice(2));
for (const key of [
  "lane",
  "variant",
  "pair",
  "position",
  "stdout",
  "stderr",
  "resolution-trace",
  "exit-code",
  "started-at",
  "finished-at",
  "command",
  "output",
]) {
  if (typeof args[key] !== "string" || args[key].length === 0)
    throw new Error(`missing --${key}`);
}
if (args.input.length !== 1)
  throw new Error("record requires exactly one --input");
if (!["baseline", "candidate"].includes(args.variant))
  throw new Error("variant must be baseline or candidate");
const pair = Number(args.pair);
const position = Number(args.position);
const exitCode = Number(args["exit-code"]);
if (!Number.isInteger(pair) || pair < 1 || pair > 9)
  throw new Error("pair must be 1 through 9");
if (![1, 2].includes(position)) throw new Error("position must be 1 or 2");
if (exitCode !== 0)
  throw new Error(`independent Vitest process exited ${exitCode}`);

const manifest = loadManifest();
if (!manifest.lanes[args.lane])
  throw new Error("lane must be lite or lite-react");
const input = resolve(args.input[0]);
const stdout = resolve(args.stdout);
const stderr = resolve(args.stderr);
const resolutionTrace = resolve(args["resolution-trace"]);
const output = resolve(args.output);
const artifact = collectArtifact(args.lane, manifest);
const environment = collectEnvironment(
  args.lane,
  fileURLToPath(import.meta.url),
  manifest
);
validatePackedDistMarkers(
  readFileSync(resolutionTrace, "utf8"),
  artifact,
  args.lane
);
const rows = extractRows(
  JSON.parse(readFileSync(input, "utf8")),
  args.lane,
  manifest
);
const body = {
  schema: "pumped-fn.lite-perf-observation.v1",
  lane: args.lane,
  variant: args.variant,
  pair,
  position,
  started_at: args["started-at"],
  finished_at: args["finished-at"],
  process: {
    command: args.command,
    cwd: packageRoot,
    exit_code: exitCode,
    launch: "independent_external_process",
  },
  environment: {
    shared: environment.shared,
    browser: environment.browser,
    shared_fingerprint: environment.shared_fingerprint,
    environment_fingerprint: environment.environment_fingerprint,
  },
  artifact,
  raw_output: {
    vitest_report: { path: input, sha256: sha256File(input) },
    stdout: { path: stdout, sha256: sha256File(stdout) },
    stderr: { path: stderr, sha256: sha256File(stderr) },
    resolution_trace: {
      path: resolutionTrace,
      sha256: sha256File(resolutionTrace),
    },
  },
  rows,
};
const observation = sealObservation(body);
validateObservation(observation, manifest);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(observation, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({
    output,
    lane: args.lane,
    rows: rows.length,
    observation_sha256: observation.observation_sha256,
    environment_fingerprint: environment.environment_fingerprint,
    artifact_fingerprint: artifact.artifact_fingerprint,
    launch: "independent_external_process",
  })}\n`
);
