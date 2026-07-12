#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  collectArtifact,
  collectEnvironment,
  configPath,
  extractRows,
  loadManifest,
  packageRoot,
  parseArgs,
  sealObservation,
  sha256,
  sha256File,
  validatePackedDistMarkers,
  validateObservation,
} from "./harness.mjs";

const args = parseArgs(process.argv.slice(2));
for (const key of ["lane", "variant", "pair", "position", "output"]) {
  if (typeof args[key] !== "string" || args[key].length === 0)
    throw new Error(`missing --${key}`);
}
if (!["baseline", "candidate"].includes(args.variant))
  throw new Error("variant must be baseline or candidate");
const pair = Number(args.pair);
const position = Number(args.position);
if (!Number.isInteger(pair) || pair < 1 || pair > 9)
  throw new Error("pair must be 1 through 9");
if (![1, 2].includes(position)) throw new Error("position must be 1 or 2");

const manifest = loadManifest();
const definition = manifest.lanes[args.lane];
if (!definition) throw new Error("lane must be lite or lite-react");
const output = resolve(args.output);
const stem = output.endsWith(".json") ? output.slice(0, -5) : output;
const rawPath = `${stem}.vitest.json`;
const stdoutPath = `${stem}.stdout.log`;
const stderrPath = `${stem}.stderr.log`;
const resolutionTracePath = `${stem}.resolution.log`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(resolutionTracePath, "");

const artifact = collectArtifact(args.lane, manifest);
const environment = collectEnvironment(
  args.lane,
  fileURLToPath(import.meta.url),
  manifest
);
const command = [
  environment.vitest_entry,
  "bench",
  "--run",
  "--config",
  configPath,
  "--project",
  definition.project,
  definition.target,
  "--outputJson",
  rawPath,
  "--no-color",
];
const startedAt = new Date().toISOString();
const result = spawnSync(process.execPath, command, {
  cwd: packageRoot,
  encoding: "utf8",
  env: { ...process.env, PUMPED_PERF_RESOLUTION_TRACE: resolutionTracePath },
});
const finishedAt = new Date().toISOString();
if (result.error) throw result.error;
writeFileSync(stdoutPath, result.stdout);
writeFileSync(stderrPath, result.stderr);
if (result.status !== 0)
  throw new Error(
    `${args.lane} Vitest process exited ${result.status}; stderr=${stderrPath}`
  );
validatePackedDistMarkers(
  readFileSync(resolutionTracePath, "utf8"),
  artifact,
  args.lane
);
const report = JSON.parse(readFileSync(rawPath, "utf8"));
const rows = extractRows(report, args.lane, manifest);
const body = {
  schema: "pumped-fn.lite-perf-observation.v1",
  lane: args.lane,
  variant: args.variant,
  pair,
  position,
  started_at: startedAt,
  finished_at: finishedAt,
  process: {
    command: [process.execPath, ...command],
    cwd: packageRoot,
    exit_code: result.status,
  },
  environment: {
    shared: environment.shared,
    browser: environment.browser,
    shared_fingerprint: environment.shared_fingerprint,
    environment_fingerprint: environment.environment_fingerprint,
  },
  artifact,
  raw_output: {
    vitest_report: { path: rawPath, sha256: sha256File(rawPath) },
    stdout: { path: stdoutPath, sha256: sha256(result.stdout) },
    stderr: { path: stderrPath, sha256: sha256(result.stderr) },
    resolution_trace: {
      path: resolutionTracePath,
      sha256: sha256File(resolutionTracePath),
    },
  },
  rows,
};
const observation = sealObservation(body);
validateObservation(observation, manifest);
writeFileSync(output, `${JSON.stringify(observation, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({
    output,
    lane: args.lane,
    rows: rows.length,
    observation_sha256: observation.observation_sha256,
    environment_fingerprint: environment.environment_fingerprint,
    artifact_fingerprint: artifact.artifact_fingerprint,
  })}\n`
);
