import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus, machine, platform, release } from "node:os";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = fileURLToPath(new URL("..", import.meta.url));
export const repoRoot = resolve(packageRoot, "../..");
export const manifestPath = resolve(packageRoot, "rows.json");
export const configPath = resolve(packageRoot, "vitest.config.ts");

const expectedLaneCounts = { lite: 39, "lite-react": 8 };
const expectedRepresentativeNames = {
  lite: new Set([
    "chain depth 10, sync factories",
    "scope.resolve()",
    "exec flow (1 resolved atom dep)",
    "watch fan-out 100 dependents",
    "set: selected value changes (all fire)",
  ]),
  "lite-react": new Set([
    "100 useAtom consumers re-render",
    "100 useSelect consumers, selector hits (re-render)",
    "mount + unmount 100 useSelect consumers",
  ]),
};

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function sha256File(path) {
  return sha256(readFileSync(path));
}

export function hashObject(value) {
  return sha256(canonical(value));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function rowId(lane, row) {
  return `${lane}:${row.file}:${row.group}:${row.name}`;
}

export function loadManifest(path = manifestPath) {
  const manifest = readJson(path);
  if (manifest.schema !== "pumped-fn.lite-perf-row-manifest.v1")
    throw new Error("row manifest schema mismatch");
  if (
    JSON.stringify(Object.keys(manifest.lanes).sort()) !==
    JSON.stringify(["lite", "lite-react"])
  ) {
    throw new Error("row manifest lane set mismatch");
  }
  for (const [lane, expectedCount] of Object.entries(expectedLaneCounts)) {
    const definition = manifest.lanes[lane];
    if (
      definition.expected_count !== expectedCount ||
      definition.rows.length !== expectedCount
    ) {
      throw new Error(`${lane} expected ${expectedCount} rows`);
    }
    const ids = new Set();
    for (const row of definition.rows) {
      if (row.id !== rowId(lane, row))
        throw new Error(`${lane} row id mismatch: ${row.id}`);
      if (ids.has(row.id)) throw new Error(`${lane} duplicate row: ${row.id}`);
      ids.add(row.id);
      const latency =
        row.group === "cold resolve (fresh scope per iteration)" ||
        row.group === "invalidation cascade (set + flush)";
      if (row.metric !== (latency ? "p75" : "hz"))
        throw new Error(`${row.id} metric mismatch`);
    }
    const representatives = new Set(
      definition.rows.filter((row) => row.representative).map((row) => row.name)
    );
    if (
      representatives.size !== expectedRepresentativeNames[lane].size ||
      [...representatives].some(
        (name) => !expectedRepresentativeNames[lane].has(name)
      )
    ) {
      throw new Error(`${lane} representative row mismatch`);
    }
  }
  return manifest;
}

export function parseArgs(values) {
  const result = { input: [] };
  for (let index = 0; index < values.length; index += 2) {
    const raw = values[index];
    const value = values[index + 1];
    if (!raw?.startsWith("--") || value === undefined)
      throw new Error(`invalid argument at ${raw ?? "end"}`);
    const key = raw.slice(2);
    if (key === "input") result.input.push(value);
    else if (result[key] !== undefined) throw new Error(`duplicate --${key}`);
    else result[key] = value;
  }
  return result;
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0)
    throw new Error(`${label} must be finite and positive`);
  return value;
}

function finiteNonnegative(value, label) {
  if (!Number.isFinite(value) || value < 0)
    throw new Error(`${label} must be finite and nonnegative`);
  return value;
}

export function extractRows(
  report,
  lane,
  manifest = loadManifest(),
  root = packageRoot
) {
  const definition = manifest.lanes[lane];
  if (!definition) throw new Error(`unknown lane ${lane}`);
  if (!Array.isArray(report.files) || report.files.length === 0)
    throw new Error(`${lane} empty benchmark report`);
  const expected = new Map(definition.rows.map((row) => [row.id, row]));
  const observed = new Map();
  for (const file of report.files) {
    const logicalPath = normalizePath(relative(root, file.filepath));
    if (logicalPath.startsWith("../") || logicalPath === "..")
      throw new Error(`benchmark file outside package: ${file.filepath}`);
    if (!Array.isArray(file.groups))
      throw new Error(`${logicalPath} groups missing`);
    for (const group of file.groups) {
      const prefix = `${logicalPath} > `;
      if (
        typeof group.fullName !== "string" ||
        !group.fullName.startsWith(prefix)
      ) {
        throw new Error(`${logicalPath} group identity missing`);
      }
      const groupName = group.fullName.slice(prefix.length);
      if (!Array.isArray(group.benchmarks))
        throw new Error(`${logicalPath} benchmarks missing`);
      for (const benchmark of group.benchmarks) {
        const id = rowId(lane, {
          file: logicalPath,
          group: groupName,
          name: benchmark.name,
        });
        const expectedRow = expected.get(id);
        if (!expectedRow)
          throw new Error(`${lane} wrong-lane or unexpected row: ${id}`);
        if (observed.has(id)) throw new Error(`${lane} duplicate row: ${id}`);
        const metricValue = finitePositive(
          benchmark[expectedRow.metric],
          `${id} ${expectedRow.metric}`
        );
        observed.set(id, {
          ...expectedRow,
          value: metricValue,
          hz: finitePositive(benchmark.hz, `${id} hz`),
          p75: finitePositive(benchmark.p75, `${id} p75`),
          rme: finiteNonnegative(benchmark.rme, `${id} rme`),
          sample_count: finitePositive(
            benchmark.sampleCount,
            `${id} sampleCount`
          ),
          raw_sample_count: Array.isArray(benchmark.samples)
            ? benchmark.samples.length
            : -1,
        });
      }
    }
  }
  const missing = definition.rows
    .filter((row) => !observed.has(row.id))
    .map((row) => row.id);
  if (missing.length > 0 || observed.size !== definition.expected_count) {
    throw new Error(
      `${lane} expected ${
        definition.expected_count
      } exact rows; missing=${missing.join(",")}`
    );
  }
  return definition.rows.map((row) => observed.get(row.id));
}

const moduleFiles = {
  "@pumped-fn/lite": resolve(repoRoot, "pkg/core/lite/dist/index.mjs"),
  "@pumped-fn/lite-react": resolve(
    repoRoot,
    "pkg/react/lite-react/dist/index.mjs"
  ),
};

const packageFiles = {
  "@pumped-fn/lite": resolve(repoRoot, "pkg/core/lite/package.json"),
  "@pumped-fn/lite-react": resolve(
    repoRoot,
    "pkg/react/lite-react/package.json"
  ),
};

function fileRecord(name, path) {
  if (!existsSync(path) || !statSync(path).isFile())
    throw new Error(`missing artifact ${path}`);
  return {
    package: name,
    path: normalizePath(relative(repoRoot, path)),
    sha256: sha256File(path),
    bytes: statSync(path).size,
  };
}

export function collectArtifact(lane, manifest = loadManifest()) {
  const modules = manifest.lanes[lane].modules.map((name) =>
    fileRecord(name, moduleFiles[name])
  );
  const package_manifests = manifest.lanes[lane].modules.map((name) =>
    fileRecord(name, packageFiles[name])
  );
  const body = { modules, package_manifests };
  return { ...body, artifact_fingerprint: hashObject(body) };
}

export function validateArtifact(artifact, lane, manifest = loadManifest()) {
  if (
    !artifact ||
    artifact.artifact_fingerprint !==
      hashObject({
        modules: artifact.modules,
        package_manifests: artifact.package_manifests,
      })
  ) {
    throw new Error(`${lane} artifact fingerprint mismatch`);
  }
  const expectedPackages = manifest.lanes[lane].modules;
  if (
    JSON.stringify(artifact.modules.map((entry) => entry.package)) !==
    JSON.stringify(expectedPackages)
  ) {
    throw new Error(`${lane} artifact module set mismatch`);
  }
  for (const entry of artifact.modules) {
    if (!entry.path.includes("/dist/") || entry.path.includes("/src/")) {
      throw new Error(`${lane} source-tree module rejected: ${entry.path}`);
    }
    if (
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !Number.isInteger(entry.bytes) ||
      entry.bytes <= 0
    ) {
      throw new Error(`${lane} invalid module identity: ${entry.path}`);
    }
  }
}

export function validatePackedDistMarkers(stderr, artifact, lane) {
  for (const module of artifact.modules) {
    const path = resolve(repoRoot, module.path);
    if (!stderr.includes(`PACKED_DIST_RESOLVE=${module.package}->${path}`)) {
      throw new Error(
        `${lane} packed-dist resolution marker missing for ${module.package}`
      );
    }
    if (
      !stderr.includes(`PACKED_DIST_TRANSFORM=${path}:sha256=${module.sha256}`)
    ) {
      throw new Error(
        `${lane} packed-dist transformed bytes mismatch for ${module.package}`
      );
    }
  }
}

export function sealObservation(body) {
  return { ...body, observation_sha256: hashObject(body) };
}

const require = createRequire(resolve(packageRoot, "package.json"));

export function packageIdentity(name, path) {
  const value = readJson(path);
  return {
    name,
    version: value.version,
    manifest_sha256: sha256File(path),
  };
}

function packageRecord(name) {
  const path = require.resolve(`${name}/package.json`);
  return { identity: packageIdentity(name, path), path };
}

function cpuRecord() {
  const counts = new Map();
  for (const cpu of cpus())
    counts.set(cpu.model, (counts.get(cpu.model) ?? 0) + 1);
  return {
    logical_count: cpus().length,
    models: [...counts]
      .map(([model, count]) => ({ model, count }))
      .sort((left, right) => left.model.localeCompare(right.model)),
  };
}

function browserRecord(lane) {
  if (lane === "lite") return { required: false, provider: "none" };
  const playwrightPackage = packageRecord("playwright");
  const { chromium } = require("playwright");
  const executable = chromium.executablePath();
  if (!existsSync(executable))
    throw new Error(`chromium executable missing: ${executable}`);
  return {
    required: true,
    browser: "chromium",
    provider: "playwright",
    provider_version: playwrightPackage.identity.version,
    provider_manifest_sha256:
      playwrightPackage.identity.manifest_sha256,
    executable_sha256: sha256File(executable),
  };
}

export function collectEnvironment(
  lane,
  observationWriter,
  manifest = loadManifest()
) {
  if (!existsSync(observationWriter))
    throw new Error(`observation writer missing: ${observationWriter}`);
  const vitest = packageRecord("vitest");
  const browserProvider = packageRecord("@vitest/browser-playwright");
  const shared = {
    runtime: {
      node: process.version,
      executable_sha256: sha256File(process.execPath),
    },
    tool: {
      vitest: vitest.identity,
      browser_provider: browserProvider.identity,
      config_sha256: sha256File(configPath),
      harness_sha256: sha256File(fileURLToPath(import.meta.url)),
      observation_writer: {
        path: normalizePath(relative(packageRoot, observationWriter)),
        sha256: sha256File(observationWriter),
      },
    },
    platform: {
      platform: platform(),
      arch: process.arch,
      machine: machine(),
      kernel: release(),
    },
    cpu: cpuRecord(),
    lock: {
      path: "pnpm-lock.yaml",
      sha256: sha256File(resolve(repoRoot, "pnpm-lock.yaml")),
    },
    row_manifest: {
      path: "benchmarks/lite-perf/rows.json",
      sha256: sha256File(manifestPath),
      schema: manifest.schema,
    },
  };
  const browser = browserRecord(lane);
  return {
    shared,
    browser,
    shared_fingerprint: hashObject(shared),
    environment_fingerprint: hashObject({ shared, browser }),
    vitest_entry: resolve(dirname(vitest.path), "vitest.mjs"),
  };
}

export function validateObservation(observation, manifest = loadManifest()) {
  if (observation.schema !== "pumped-fn.lite-perf-observation.v1")
    throw new Error("observation schema mismatch");
  const definition = manifest.lanes[observation.lane];
  if (!definition)
    throw new Error(`unknown observation lane ${observation.lane}`);
  if (!["baseline", "candidate"].includes(observation.variant))
    throw new Error("observation variant mismatch");
  if (
    !Number.isInteger(observation.pair) ||
    observation.pair < 1 ||
    observation.pair > 9
  )
    throw new Error("observation pair mismatch");
  if (![1, 2].includes(observation.position))
    throw new Error("observation position mismatch");
  if (
    observation.environment.shared_fingerprint !==
    hashObject(observation.environment.shared)
  ) {
    throw new Error("shared environment fingerprint mismatch");
  }
  if (
    observation.environment.environment_fingerprint !==
    hashObject({
      shared: observation.environment.shared,
      browser: observation.environment.browser,
    })
  ) {
    throw new Error("environment fingerprint mismatch");
  }
  validateArtifact(observation.artifact, observation.lane, manifest);
  if (
    !Array.isArray(observation.rows) ||
    observation.rows.length !== definition.expected_count
  ) {
    throw new Error(`${observation.lane} observation row count mismatch`);
  }
  for (let index = 0; index < definition.rows.length; index += 1) {
    const expected = definition.rows[index];
    const row = observation.rows[index];
    if (row.id !== expected.id || row.metric !== expected.metric)
      throw new Error(`${observation.lane} observation row identity mismatch`);
    finitePositive(row.value, `${row.id} value`);
  }
  const { observation_sha256: declared, ...body } = observation;
  if (declared !== hashObject(body))
    throw new Error("observation content hash mismatch");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

function classify(ratios, requiredDirectionalAgreement) {
  const passing = ratios.filter((ratio) => ratio >= 0.95).length;
  if (passing >= requiredDirectionalAgreement) return "no_regression";
  if (ratios.length - passing >= requiredDirectionalAgreement)
    return "confirmed_regression";
  return "inconclusive";
}

function supportsImprovement(ratios, requiredDirectionalAgreement) {
  return (
    ratios.filter((ratio) => ratio >= 1.1).length >=
    requiredDirectionalAgreement
  );
}

function laneComparison(
  lane,
  observations,
  manifest,
  pairCount,
  requiredDirectionalAgreement
) {
  const definition = manifest.lanes[lane];
  const pairs = Array.from({ length: pairCount }, (_, index) => index + 1);
  const expectedOrder = pairs.map((pair) =>
    pair % 2 === 1 ? ["baseline", "candidate"] : ["candidate", "baseline"]
  );
  for (const pair of pairs) {
    const pairRows = observations.filter(
      (observation) => observation.pair === pair
    );
    const actual = pairRows
      .sort((left, right) => left.position - right.position)
      .map((observation) => observation.variant);
    if (
      pairRows.length !== 2 ||
      JSON.stringify(actual) !== JSON.stringify(expectedOrder[pair - 1])
    ) {
      throw new Error(`${lane} pair ${pair} order mismatch`);
    }
  }
  const rows = definition.rows.map((expected, rowIndex) => {
    const pairedRatios = pairs.map((pair) => {
      const pairRows = observations.filter(
        (observation) => observation.pair === pair
      );
      const baseline = pairRows.find(
        (observation) => observation.variant === "baseline"
      ).rows[rowIndex].value;
      const candidate = pairRows.find(
        (observation) => observation.variant === "candidate"
      ).rows[rowIndex].value;
      return expected.metric === "p75"
        ? baseline / candidate
        : candidate / baseline;
    });
    const ratioMedian = median(pairedRatios);
    return {
      id: expected.id,
      file: expected.file,
      group: expected.group,
      name: expected.name,
      metric: expected.metric,
      representative: expected.representative,
      paired_ratios: pairedRatios,
      median_ratio: round(ratioMedian),
      mad: round(
        median(pairedRatios.map((ratio) => Math.abs(ratio - ratioMedian)))
      ),
      agreement_at_0_95: pairedRatios.filter((ratio) => ratio >= 0.95).length,
      agreement_at_1_10: pairedRatios.filter((ratio) => ratio >= 1.1).length,
      classification: classify(pairedRatios, requiredDirectionalAgreement),
      improvement_supported: supportsImprovement(
        pairedRatios,
        requiredDirectionalAgreement
      ),
    };
  });
  const representativeRows = rows.filter((row) => row.representative);
  const pairScores = pairs.map((_, pairIndex) =>
    Math.exp(
      representativeRows.reduce(
        (sum, row) => sum + Math.log(row.paired_ratios[pairIndex]),
        0
      ) / representativeRows.length
    )
  );
  const scoreMedian = median(pairScores);
  return {
    lane,
    row_count: rows.length,
    representative_row_count: representativeRows.length,
    rows,
    representative: {
      pair_scores: pairScores.map(round),
      median_ratio: round(scoreMedian),
      mad: round(
        median(pairScores.map((ratio) => Math.abs(ratio - scoreMedian)))
      ),
      agreement_at_0_95: pairScores.filter((ratio) => ratio >= 0.95).length,
      agreement_at_1_10: pairScores.filter((ratio) => ratio >= 1.1).length,
      classification: classify(pairScores, requiredDirectionalAgreement),
      improvement_supported: supportsImprovement(
        pairScores,
        requiredDirectionalAgreement
      ),
    },
  };
}

function artifactEntryHash(observations, variant, collection, packageName) {
  return observations
    .find((observation) => observation.variant === variant)
    .artifact[collection].find((entry) => entry.package === packageName)
    ?.sha256;
}

export function compareObservations(
  observations,
  mode,
  manifest = loadManifest()
) {
  const lanes =
    mode === "full"
      ? ["lite", "lite-react"]
      : mode === "lite-only"
      ? ["lite"]
      : null;
  if (!lanes) throw new Error("mode must be full or lite-only");
  const pairCount = observations.length / (lanes.length * 2);
  if (!Number.isInteger(pairCount) || ![5, 9].includes(pairCount))
    throw new Error("comparison pair count must be 5 or 9");
  const requiredDirectionalAgreement = pairCount === 5 ? 5 : 8;
  for (const observation of observations)
    validateObservation(observation, manifest);
  const observedLanes = [
    ...new Set(observations.map((observation) => observation.lane)),
  ].sort();
  if (JSON.stringify(observedLanes) !== JSON.stringify([...lanes].sort()))
    throw new Error("comparison lane set mismatch");
  const keys = observations.map(
    (observation) =>
      `${observation.lane}:${observation.pair}:${observation.position}`
  );
  if (new Set(keys).size !== keys.length)
    throw new Error("duplicate observation position");
  if (
    new Set(
      observations.map(
        (observation) => observation.environment.shared_fingerprint
      )
    ).size !== 1
  ) {
    throw new Error("shared environments differ");
  }
  const artifact_identities = {};
  const environment_fingerprints = {};
  const laneReports = {};
  for (const lane of lanes) {
    const laneObservations = observations.filter(
      (observation) => observation.lane === lane
    );
    if (
      new Set(
        laneObservations.map(
          (observation) => observation.environment.environment_fingerprint
        )
      ).size !== 1
    ) {
      throw new Error(`${lane} environments differ`);
    }
    environment_fingerprints[lane] =
      laneObservations[0].environment.environment_fingerprint;
    artifact_identities[lane] = {};
    for (const variant of ["baseline", "candidate"]) {
      const identities = new Set(
        laneObservations
          .filter((observation) => observation.variant === variant)
          .map((observation) => observation.artifact.artifact_fingerprint)
      );
      if (identities.size !== 1)
        throw new Error(`${lane} ${variant} artifact identities differ`);
      artifact_identities[lane][variant] = [...identities][0];
    }
    laneReports[lane] = laneComparison(
      lane,
      laneObservations,
      manifest,
      pairCount,
      requiredDirectionalAgreement
    );
  }
  if (mode === "full") {
    for (const variant of ["baseline", "candidate"]) {
      for (const collection of ["modules", "package_manifests"]) {
        if (
          artifactEntryHash(
            observations.filter((observation) => observation.lane === "lite"),
            variant,
            collection,
            "@pumped-fn/lite"
          ) !==
          artifactEntryHash(
            observations.filter(
              (observation) => observation.lane === "lite-react"
            ),
            variant,
            collection,
            "@pumped-fn/lite"
          )
        ) {
          throw new Error(
            `${variant} Lite ${collection} identity differs across lanes`
          );
        }
      }
    }
  }
  const rows = Object.values(laneReports).flatMap((report) => report.rows);
  const regressions = rows
    .filter((row) => row.classification === "confirmed_regression")
    .map((row) => row.id);
  const inconclusive = rows
    .filter((row) => row.classification === "inconclusive")
    .map((row) => row.id);
  const missingLaneRows =
    mode === "lite-only" ? manifest.lanes["lite-react"].expected_count : 0;
  const representativeLaneRatio =
    mode === "full"
      ? Math.min(
          laneReports.lite.representative.median_ratio,
          laneReports["lite-react"].representative.median_ratio
        )
      : null;
  const performanceEvidenceGapCount = missingLaneRows + inconclusive.length;
  const decision =
    regressions.length > 0
      ? "rejected_confirmed_regression"
      : inconclusive.length > 0
      ? "evidence_inconclusive"
      : mode === "lite-only"
      ? "lite_only_evidence_not_full_claim"
      : Object.values(laneReports).every(
          (report) => report.representative.improvement_supported
        )
      ? "candidate_threshold_supported"
      : "no_regression_candidate_threshold_not_supported";
  return {
    schema: "pumped-fn.lite-perf-comparison.v1",
    mode,
    pair_count: pairCount,
    required_directional_agreement: requiredDirectionalAgreement,
    pair_order: Array.from({ length: pairCount }, (_, index) =>
      index % 2 === 0 ? "baseline-candidate" : "candidate-baseline"
    ),
    raw_unit: "one independent Vitest process summary per lane",
    row_count: rows.length,
    environment_fingerprints,
    artifact_identities,
    lanes: laneReports,
    representative_lane_ratio: representativeLaneRatio,
    performance_regression_case_count: regressions.length,
    performance_evidence_gap_count: performanceEvidenceGapCount,
    regressions,
    inconclusive_rows: inconclusive,
    missing_lane_row_count: missingLaneRows,
    decision,
  };
}
