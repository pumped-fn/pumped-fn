import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { dirname, relative, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build, version as viteVersion } from "vite"
import { pumped } from "@pumped-fn/pumped"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../../..")
const fixtureRoot = resolve(here, "fixture/roots")
const evidenceFile = resolve(here, "app-target-roots-v2.json")
const rootMarkers = {
  server: "ROOT_SERVER",
  cli: "ROOT_CLI",
  agents: "ROOT_AGENT",
  jobs: "ROOT_JOB",
  workflows: "ROOT_WORKFLOW",
}
const appMarkers = {
  default: "APP_DEFAULT_MARKER",
  east: "APP_EAST_MARKER",
  west: "APP_WEST_MARKER",
}
const expectedApps = {
  default: ["default"],
  east: ["default", "east"],
  west: ["default", "west"],
}
const expectedRoots = {
  server: ["server", "agents", "jobs", "workflows"],
  cli: ["cli", "agents"],
}

function buildConfig(target) {
  return {
    build: {
      ssr: true,
      outDir: "dist",
      emptyOutDir: false,
      rollupOptions: {
        input: target === "server" ? "virtual:pumped/entry-server" : "virtual:pumped/entry-cli",
        output: { entryFileNames: `${target}.mjs` },
      },
    },
  }
}

process.chdir(root)

function hash(value) {
  return createHash("sha256").update(value).digest("hex")
}

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = resolve(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : [file]
  }).sort()
}

function normalize(file) {
  const clean = file.replaceAll("\\", "/").replace(/^\0/, "<virtual>:")
  return clean.startsWith(root.replaceAll("\\", "/"))
    ? `<repo>/${relative(root, clean).replaceAll("\\", "/")}`
    : clean
}

async function capture(appName, target) {
  const config = buildConfig(target)
  const result = await build({
    ...config,
    configFile: false,
    logLevel: "silent",
    root: fixtureRoot,
    plugins: pumped.plugin({ dir: "src", app: appName }),
    build: {
      ...config.build,
      minify: false,
      target: "es2022",
      write: false,
    },
  })
  const outputs = (Array.isArray(result) ? result : [result]).flatMap((item) => item.output)
  const chunks = outputs.filter((item) => item.type === "chunk")
  const code = chunks.map((chunk) => chunk.code).join("\n")
  const includedRoots = Object.entries(rootMarkers)
    .filter(([, marker]) => code.includes(marker))
    .map(([kind]) => kind)
  const includedApps = Object.entries(appMarkers)
    .filter(([, marker]) => code.includes(marker))
    .map(([name]) => name)
  const expected = expectedRoots[target]
  const pass = JSON.stringify(includedRoots.sort()) === JSON.stringify([...expected].sort())
    && JSON.stringify(includedApps) === JSON.stringify(expectedApps[appName])

  return {
    app: appName,
    target,
    expectedRoots: expected,
    expectedApps: expectedApps[appName],
    includedRoots,
    includedApps,
    emittedBytes: chunks.reduce((total, chunk) => total + Buffer.byteLength(chunk.code), 0),
    modules: [...new Set(chunks.flatMap((chunk) => Object.keys(chunk.modules).map(normalize)))].sort(),
    pass,
  }
}

async function createEvidence() {
  const cases = []
  for (const appName of Object.keys(appMarkers)) {
    for (const target of Object.keys(expectedRoots)) {
      cases.push(await capture(appName, target))
    }
  }
  const fixtureInputs = Object.fromEntries(
    sourceFiles(resolve(fixtureRoot, "src")).map((file) => [normalize(file), hash(readFileSync(file))])
  )
  const evidence = {
    schemaVersion: 1,
    nullHypothesis: "Selecting an app and build target does not isolate the intended production roots.",
    frozenGate: {
      selectedAppOnly: true,
      exactAppsBySelection: expectedApps,
      exactRootsByTarget: expectedRoots,
      cases: Object.keys(appMarkers).length * Object.keys(expectedRoots).length,
    },
    environment: {
      node: process.version,
      vite: viteVersion,
    },
    inputs: {
      fixtures: fixtureInputs,
      pumpedPackage: hash(readFileSync(resolve(root, "pkg/framework/pumped/dist/index.mjs"))),
      pumpedPackageBytes: statSync(resolve(root, "pkg/framework/pumped/dist/index.mjs")).size,
    },
    cases,
    decision: {
      passedCases: cases.filter((item) => item.pass).length,
      totalCases: cases.length,
      nullRejected: cases.every((item) => item.pass),
    },
  }
  return { ...evidence, selfHash: hash(JSON.stringify(evidence)) }
}

const evidence = await createEvidence()
const output = `${JSON.stringify(evidence, null, 2)}\n`

if (process.argv.includes("--write")) {
  writeFileSync(evidenceFile, output)
  process.stdout.write(output)
} else {
  const existing = readFileSync(evidenceFile, "utf8")
  if (existing !== output) {
    process.stderr.write("app target evidence changed; run capture-app-targets.mjs --write and review the result\n")
    process.exitCode = 1
  } else {
    process.stdout.write(`app target evidence matches ${evidence.selfHash}\n`)
  }
}
