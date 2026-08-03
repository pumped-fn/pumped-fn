import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build, version as viteVersion } from "vite"
import { pumped } from "@pumped-fn/pumped"

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, "../../../../..")
const fixtureRoot = resolve(here, "fixture/roots")
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
  return {
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
    cases,
    decision: {
      passedCases: cases.filter((item) => item.pass).length,
      totalCases: cases.length,
      nullRejected: cases.every((item) => item.pass),
    },
  }
}

const evidence = await createEvidence()
process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`)
if (!evidence.decision.nullRejected) process.exitCode = 1
