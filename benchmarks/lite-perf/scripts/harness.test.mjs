import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  compareObservations,
  extractRows,
  hashObject,
  loadManifest,
  packageIdentity,
  packageRoot,
  repoRoot,
  sha256,
  validateObservation,
  validatePackedDistMarkers,
} from "./harness.mjs";

const manifest = loadManifest();

function rawReport(lane) {
  const files = new Map();
  for (const row of manifest.lanes[lane].rows) {
    if (!files.has(row.file)) files.set(row.file, new Map());
    const groups = files.get(row.file);
    if (!groups.has(row.group)) groups.set(row.group, []);
    groups.get(row.group).push({
      name: row.name,
      hz: 100,
      p75: 100,
      rme: 1,
      sampleCount: 100,
      samples: [],
    });
  }
  return {
    files: [...files].map(([file, groups]) => ({
      filepath: resolve(packageRoot, file),
      groups: [...groups].map(([group, benchmarks]) => ({
        fullName: `${file} > ${group}`,
        benchmarks,
      })),
    })),
  };
}

function artifact(lane, variant) {
  const packages = manifest.lanes[lane].modules;
  const modules = packages.map((name) => ({
    package: name,
    path:
      name === "@pumped-fn/lite"
        ? "pkg/core/lite/dist/index.mjs"
        : "pkg/react/lite-react/dist/index.mjs",
    sha256: sha256(`${variant}:${name}:module`),
    bytes: 100,
  }));
  const package_manifests = packages.map((name) => ({
    package: name,
    path:
      name === "@pumped-fn/lite"
        ? "pkg/core/lite/package.json"
        : "pkg/react/lite-react/package.json",
    sha256: sha256(`${variant}:${name}:manifest`),
    bytes: 100,
  }));
  const body = { modules, package_manifests };
  return { ...body, artifact_fingerprint: hashObject(body) };
}

function seal(body) {
  return { ...body, observation_sha256: hashObject(body) };
}

function observation(lane, variant, pair, position, ratio) {
  const shared = {
    runtime: {
      node: "v1",
      executable_sha256: sha256("node"),
    },
    tool: {
      vitest: {
        name: "vitest",
        version: "4.1.8",
        manifest_sha256: sha256("vitest-package"),
      },
      browser_provider: {
        name: "@vitest/browser-playwright",
        version: "4.1.8",
        manifest_sha256: sha256("browser-provider-package"),
      },
      config_sha256: sha256("config"),
      harness_sha256: sha256("harness"),
      observation_writer: {
        path: "scripts/capture.mjs",
        sha256: sha256("writer"),
      },
    },
    platform: {
      platform: "linux",
      arch: "x64",
      machine: "x86_64",
      kernel: "test",
    },
    cpu: { logical_count: 1, models: [{ model: "test", count: 1 }] },
    lock: { path: "pnpm-lock.yaml", sha256: sha256("lock") },
    row_manifest: {
      path: "benchmarks/lite-perf/rows.json",
      sha256: sha256("rows"),
      schema: manifest.schema,
    },
  };
  const browser =
    lane === "lite"
      ? { required: false, provider: "none" }
      : {
          required: true,
          provider: "playwright",
          browser: "chromium",
          executable_sha256: sha256("chromium"),
          provider_version: "1.0.0",
          provider_manifest_sha256: sha256("playwright-package"),
        };
  const rows = manifest.lanes[lane].rows.map((row) => {
    const value =
      variant === "baseline"
        ? 100
        : row.metric === "p75"
        ? 100 / ratio
        : 100 * ratio;
    return {
      ...row,
      value,
      hz: value,
      p75: value,
      rme: 1,
      sample_count: 100,
      raw_sample_count: 0,
    };
  });
  return seal({
    schema: "pumped-fn.lite-perf-observation.v1",
    lane,
    variant,
    pair,
    position,
    started_at: "2026-01-01T00:00:00.000Z",
    finished_at: "2026-01-01T00:00:01.000Z",
    process: { command: ["node", "vitest"], cwd: packageRoot, exit_code: 0 },
    environment: {
      shared,
      browser,
      shared_fingerprint: hashObject(shared),
      environment_fingerprint: hashObject({ shared, browser }),
    },
    artifact: artifact(lane, variant),
    raw_output: {},
    rows,
  });
}

function observations(mode, ratios = [1.11, 1.11, 1.11, 1.11, 1.11]) {
  const lanes = mode === "full" ? ["lite", "lite-react"] : ["lite"];
  const order = ratios.map((_, index) =>
    index % 2 === 0 ? ["baseline", "candidate"] : ["candidate", "baseline"]
  );
  return lanes.flatMap((lane) =>
    order.flatMap((variants, pairIndex) =>
      variants.map((variant, positionIndex) =>
        observation(
          lane,
          variant,
          pairIndex + 1,
          positionIndex + 1,
          ratios[pairIndex]
        )
      )
    )
  );
}

function reseal(observation) {
  const { observation_sha256: _, ...body } = observation;
  return seal(body);
}

test("manifest fixes exact lanes, metrics, and representative rows", () => {
  assert.equal(manifest.lanes.lite.rows.length, 39);
  assert.equal(manifest.lanes["lite-react"].rows.length, 8);
  assert.equal(
    manifest.lanes.lite.rows.filter((row) => row.representative).length,
    5
  );
  assert.equal(
    manifest.lanes["lite-react"].rows.filter((row) => row.representative)
      .length,
    3
  );
  assert.equal(
    manifest.lanes.lite.rows.find(
      (row) => row.name === "watch fan-out 100 dependents"
    ).metric,
    "p75"
  );
});

test("package identity ignores install roots and retains version and manifest bytes", () => {
  const root = mkdtempSync(join(tmpdir(), "lite-perf-package-identity-"));
  const left = join(root, "left", "package.json");
  const right = join(root, "right", "package.json");
  mkdirSync(join(root, "left"), { recursive: true });
  mkdirSync(join(root, "right"), { recursive: true });
  const manifest = `${JSON.stringify({ name: "tool", version: "1.0.0" }, null, 2)}\n`;
  writeFileSync(left, manifest);
  writeFileSync(right, manifest);

  try {
    assert.deepEqual(packageIdentity("tool", left), packageIdentity("tool", right));
    writeFileSync(right, JSON.stringify({ name: "tool", version: "2.0.0" }));
    assert.notDeepEqual(packageIdentity("tool", left), packageIdentity("tool", right));
    writeFileSync(right, JSON.stringify({ name: "tool", version: "1.0.0" }));
    assert.notDeepEqual(packageIdentity("tool", left), packageIdentity("tool", right));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("raw extraction returns every exact row", () => {
  assert.equal(extractRows(rawReport("lite"), "lite", manifest).length, 39);
  assert.equal(
    extractRows(rawReport("lite-react"), "lite-react", manifest).length,
    8
  );
});

test("raw extraction rejects empty, missing, duplicate, non-finite, and wrong-lane results", () => {
  assert.throws(
    () => extractRows({ files: [] }, "lite", manifest),
    /empty benchmark report/
  );
  const missing = rawReport("lite");
  missing.files[0].groups[0].benchmarks.pop();
  assert.throws(
    () => extractRows(missing, "lite", manifest),
    /expected 39 exact rows/
  );
  const duplicate = rawReport("lite");
  duplicate.files[0].groups[0].benchmarks.push({
    ...duplicate.files[0].groups[0].benchmarks[0],
  });
  assert.throws(
    () => extractRows(duplicate, "lite", manifest),
    /duplicate row/
  );
  const nonfinite = rawReport("lite");
  nonfinite.files[0].groups[0].benchmarks[0].hz = Number.NaN;
  assert.throws(
    () => extractRows(nonfinite, "lite", manifest),
    /finite and positive/
  );
  const wrongLane = rawReport("lite");
  wrongLane.files.push(rawReport("lite-react").files[0]);
  assert.throws(
    () => extractRows(wrongLane, "lite", manifest),
    /wrong-lane or unexpected row/
  );
});

test("packed-dist proof requires exact transformed-byte markers", () => {
  const value = artifact("lite-react", "candidate");
  const stderr = value.modules
    .map((module) => {
      const path = resolve(repoRoot, module.path);
      return `PACKED_DIST_RESOLVE=${module.package}->${path}\nPACKED_DIST_TRANSFORM=${path}:sha256=${module.sha256}`;
    })
    .join("\n");
  assert.doesNotThrow(() =>
    validatePackedDistMarkers(stderr, value, "lite-react")
  );
  assert.throws(
    () => validatePackedDistMarkers("", value, "lite-react"),
    /resolution marker missing/
  );
  const resolutionOnly = value.modules
    .map(
      (module) =>
        `PACKED_DIST_RESOLVE=${module.package}->${resolve(
          repoRoot,
          module.path
        )}`
    )
    .join("\n");
  assert.throws(
    () => validatePackedDistMarkers(resolutionOnly, value, "lite-react"),
    /transformed bytes mismatch/
  );
});

test("full comparison reports 47 rows and both representative lanes", () => {
  const result = compareObservations(observations("full"), "full", manifest);
  assert.equal(result.pair_count, 5);
  assert.equal(result.required_directional_agreement, 5);
  assert.equal(result.row_count, 47);
  assert.equal(result.lanes.lite.row_count, 39);
  assert.equal(result.lanes["lite-react"].row_count, 8);
  assert.equal(result.performance_regression_case_count, 0);
  assert.equal(result.performance_evidence_gap_count, 0);
  assert.equal(result.regressions.length, 0);
  assert.equal(result.inconclusive_rows.length, 0);
  assert.equal(result.decision, "candidate_threshold_supported");
  assert.ok(result.representative_lane_ratio >= 1.1);
});

test("Lite-only comparison remains an explicit eight-row evidence gap", () => {
  const result = compareObservations(
    observations("lite-only"),
    "lite-only",
    manifest
  );
  assert.equal(result.row_count, 39);
  assert.equal(result.missing_lane_row_count, 8);
  assert.equal(result.performance_evidence_gap_count, 8);
  assert.equal(result.representative_lane_ratio, null);
  assert.equal(result.decision, "lite_only_evidence_not_full_claim");
});

test("mixed pairs are inconclusive instead of false-green", () => {
  const result = compareObservations(
    observations("full", [1.1, 1.1, 1.1, 1.1, 0.9]),
    "full",
    manifest
  );
  assert.equal(result.performance_regression_case_count, 0);
  assert.equal(result.inconclusive_rows.length, 47);
  assert.equal(result.performance_evidence_gap_count, 47);
  assert.equal(result.decision, "evidence_inconclusive");
});

test("five below-floor pairs become confirmed regressions", () => {
  const result = compareObservations(
    observations("full", [0.9, 0.9, 0.9, 0.9, 0.9]),
    "full",
    manifest
  );
  assert.equal(result.performance_regression_case_count, 47);
  assert.equal(result.inconclusive_rows.length, 0);
  assert.equal(result.decision, "rejected_confirmed_regression");
});

test("observation validation accepts only pair labels 1 through 9", () => {
  assert.doesNotThrow(() =>
    validateObservation(observation("lite", "baseline", 9, 1, 1), manifest)
  );
  assert.throws(
    () =>
      validateObservation(observation("lite", "candidate", 10, 2, 1), manifest),
    /observation pair mismatch/
  );
});

test("nine-pair 8 of 9 agreement supports no regression and full 47-row accounting", () => {
  const result = compareObservations(
    observations("full", [1.11, 1.11, 1.11, 1.11, 1.11, 1.11, 1.11, 1.11, 0.9]),
    "full",
    manifest
  );
  assert.equal(result.pair_count, 9);
  assert.equal(result.required_directional_agreement, 8);
  assert.equal(result.row_count, 47);
  assert.equal(result.performance_regression_case_count, 0);
  assert.equal(result.performance_evidence_gap_count, 0);
  assert.equal(result.lanes.lite.representative.agreement_at_0_95, 8);
  assert.equal(result.lanes.lite.representative.agreement_at_1_10, 8);
  assert.equal(result.decision, "candidate_threshold_supported");
});

test("nine-pair 8 of 9 below floor confirms regression", () => {
  const result = compareObservations(
    observations("full", [0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 1]),
    "full",
    manifest
  );
  assert.equal(result.performance_regression_case_count, 47);
  assert.equal(result.performance_evidence_gap_count, 0);
  assert.equal(result.inconclusive_rows.length, 0);
  assert.equal(result.decision, "rejected_confirmed_regression");
});

test("nine-pair mixed direction remains fail-closed", () => {
  const result = compareObservations(
    observations("full", [1, 1, 1, 1, 1, 1, 1, 0.9, 0.9]),
    "full",
    manifest
  );
  assert.equal(result.performance_regression_case_count, 0);
  assert.equal(result.inconclusive_rows.length, 47);
  assert.equal(result.performance_evidence_gap_count, 47);
  assert.equal(result.decision, "evidence_inconclusive");
});

test("comparison rejects unsupported pair counts and nine-pair order drift", () => {
  assert.throws(
    () =>
      compareObservations(
        observations("lite-only", [1, 1, 1, 1, 1, 1]),
        "lite-only",
        manifest
      ),
    /pair count must be 5 or 9/
  );

  const wrongOrder = observations("lite-only", [1, 1, 1, 1, 1, 1, 1, 1, 1]);
  wrongOrder[16] = reseal({
    ...wrongOrder[16],
    variant: "candidate",
    artifact: artifact("lite", "candidate"),
  });
  assert.throws(
    () => compareObservations(wrongOrder, "lite-only", manifest),
    /pair 9 order mismatch/
  );
});

test("comparison rejects wrong order, environment drift, artifact drift, row gaps, and source modules", () => {
  const wrongOrder = observations("lite-only");
  wrongOrder[0] = reseal({
    ...wrongOrder[0],
    variant: "candidate",
    artifact: artifact("lite", "candidate"),
  });
  assert.throws(
    () => compareObservations(wrongOrder, "lite-only", manifest),
    /pair 1 order mismatch/
  );

  const environmentDrift = observations("lite-only");
  const changedShared = {
    ...environmentDrift[9].environment.shared,
    cpu: { logical_count: 2, models: [{ model: "test", count: 2 }] },
  };
  environmentDrift[9] = reseal({
    ...environmentDrift[9],
    environment: {
      ...environmentDrift[9].environment,
      shared: changedShared,
      shared_fingerprint: hashObject(changedShared),
      environment_fingerprint: hashObject({
        shared: changedShared,
        browser: environmentDrift[9].environment.browser,
      }),
    },
  });
  assert.throws(
    () => compareObservations(environmentDrift, "lite-only", manifest),
    /shared environments differ/
  );

  const locationDrift = observations("lite-only");
  locationDrift[9] = reseal({
    ...locationDrift[9],
    process: {
      ...locationDrift[9].process,
      command: ["/other/root/node", "/other/root/vitest.mjs"],
      cwd: "/other/root",
    },
    raw_output: {
      stdout: { path: "/other/root/stdout.log", sha256: sha256("stdout") },
    },
  });
  assert.doesNotThrow(() =>
    compareObservations(locationDrift, "lite-only", manifest)
  );

  const sharedMutations = [
    (shared) => { shared.runtime.node = "v2"; },
    (shared) => { shared.runtime.executable_sha256 = sha256("other-node"); },
    (shared) => { shared.tool.vitest.name = "other-vitest"; },
    (shared) => { shared.tool.vitest.version = "5.0.0"; },
    (shared) => { shared.tool.vitest.manifest_sha256 = sha256("other-vitest"); },
    (shared) => {
      shared.tool.browser_provider.name = "other-browser-provider";
    },
    (shared) => { shared.tool.browser_provider.version = "5.0.0"; },
    (shared) => {
      shared.tool.browser_provider.manifest_sha256 = sha256("other-provider");
    },
    (shared) => { shared.tool.config_sha256 = sha256("other-config"); },
    (shared) => { shared.tool.harness_sha256 = sha256("other-harness"); },
    (shared) => {
      shared.tool.observation_writer.path = "scripts/other-writer.mjs";
    },
    (shared) => {
      shared.tool.observation_writer.sha256 = sha256("other-writer");
    },
    (shared) => { shared.lock.sha256 = sha256("other-lock"); },
    (shared) => { shared.row_manifest.sha256 = sha256("other-rows"); },
    (shared) => { shared.platform.platform = "other-platform"; },
    (shared) => { shared.platform.arch = "other-arch"; },
    (shared) => { shared.platform.machine = "other-machine"; },
    (shared) => { shared.platform.kernel = "other-kernel"; },
    (shared) => {
      shared.cpu = { logical_count: 2, models: [{ model: "test", count: 2 }] };
    },
  ];
  for (const mutate of sharedMutations) {
    const drift = observations("lite-only");
    const shared = structuredClone(drift[9].environment.shared);
    mutate(shared);
    drift[9] = reseal({
      ...drift[9],
      environment: {
        ...drift[9].environment,
        shared,
        shared_fingerprint: hashObject(shared),
        environment_fingerprint: hashObject({
          shared,
          browser: drift[9].environment.browser,
        }),
      },
    });
    assert.throws(
      () => compareObservations(drift, "lite-only", manifest),
      /shared environments differ/
    );
  }

  const browserMutations = [
    (browser) => { browser.browser = "other-browser"; },
    (browser) => { browser.provider = "other-provider"; },
    (browser) => { browser.provider_version = "2.0.0"; },
    (browser) => {
      browser.provider_manifest_sha256 = sha256("other-playwright");
    },
    (browser) => { browser.executable_sha256 = sha256("other-chromium"); },
  ];
  for (const mutate of browserMutations) {
    const drift = observations("full");
    const browser = structuredClone(drift[19].environment.browser);
    mutate(browser);
    drift[19] = reseal({
      ...drift[19],
      environment: {
        ...drift[19].environment,
        browser,
        environment_fingerprint: hashObject({
          shared: drift[19].environment.shared,
          browser,
        }),
      },
    });
    assert.throws(
      () => compareObservations(drift, "full", manifest),
      /lite-react environments differ/
    );
  }

  const artifactDrift = observations("lite-only");
  const changedArtifact = structuredClone(artifactDrift[8].artifact);
  changedArtifact.modules[0].sha256 = sha256("drift");
  changedArtifact.artifact_fingerprint = hashObject({
    modules: changedArtifact.modules,
    package_manifests: changedArtifact.package_manifests,
  });
  artifactDrift[8] = reseal({ ...artifactDrift[8], artifact: changedArtifact });
  assert.throws(
    () => compareObservations(artifactDrift, "lite-only", manifest),
    /artifact identities differ/
  );

  const manifestDrift = observations("lite-only");
  const changedManifest = structuredClone(manifestDrift[8].artifact);
  changedManifest.package_manifests[0].sha256 = sha256("manifest-drift");
  changedManifest.artifact_fingerprint = hashObject({
    modules: changedManifest.modules,
    package_manifests: changedManifest.package_manifests,
  });
  manifestDrift[8] = reseal({
    ...manifestDrift[8],
    artifact: changedManifest,
  });
  assert.throws(
    () => compareObservations(manifestDrift, "lite-only", manifest),
    /artifact identities differ/
  );

  const rowGap = observations("lite-only");
  rowGap[0].rows.pop();
  rowGap[0] = reseal(rowGap[0]);
  assert.throws(
    () => compareObservations(rowGap, "lite-only", manifest),
    /row count mismatch/
  );

  const sourceArtifact = observations("lite-only");
  const source = structuredClone(sourceArtifact[0].artifact);
  source.modules[0].path = "pkg/core/lite/src/index.ts";
  source.artifact_fingerprint = hashObject({
    modules: source.modules,
    package_manifests: source.package_manifests,
  });
  sourceArtifact[0] = reseal({ ...sourceArtifact[0], artifact: source });
  assert.throws(
    () => compareObservations(sourceArtifact, "lite-only", manifest),
    /source-tree module rejected/
  );
});
