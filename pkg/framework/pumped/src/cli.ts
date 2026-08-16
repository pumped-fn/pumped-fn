#!/usr/bin/env node
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { cac } from "cac"
import {
  build as viteBuild,
  createServer as createViteServer,
  loadConfigFromFile,
  mergeConfig,
  type InlineConfig,
  type Plugin,
} from "vite"
import { analyze, type GraphFailure } from "./analyze"
import { buildConfig, manifestConfig, planTarget, type BuildTarget } from "./build-config"
import type { PumpedConfig } from "./config"
import { manifestId, pumped } from "./plugin"
import type { Manifest, ManifestIdentity } from "./runtime/manifest"

type Target = "server" | "cli" | "all"
type GeneratedManifest = Manifest & { identity: ManifestIdentity }

const CONFIG_FILES = ["pumped.config.ts", "pumped.config.mts", "pumped.config.js", "pumped.config.mjs"]
const VITE_CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"]

async function loadPumpedConfig(): Promise<PumpedConfig> {
  const ignored = VITE_CONFIG_FILES.find((name) => existsSync(name))
  if (ignored) {
    process.stderr.write(`pumped ignores ${ignored}; put Vite overrides in pumped.config.ts under "vite"\n`)
  }
  const file = CONFIG_FILES.find((name) => existsSync(name))
  if (!file) return {}
  const loaded = await loadConfigFromFile({ command: "build", mode: "production" }, file)
  return (loaded?.config ?? {}) as PumpedConfig
}

function inlineConfig(config: PumpedConfig, extra: Record<string, unknown>, plugins: Plugin[]): InlineConfig {
  const merged = mergeConfig(config.vite ?? {}, { ...extra, plugins }) as InlineConfig
  return { ...merged, configFile: false }
}

async function withSelectedApp<T>(name: string | undefined, fn: () => Promise<T>): Promise<T> {
  if (name === undefined) return fn()
  const previous = process.env["PUMPED_APP"]
  process.env["PUMPED_APP"] = name
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env["PUMPED_APP"]
    else process.env["PUMPED_APP"] = previous
  }
}

function reportFailures(failures: readonly GraphFailure[]): void {
  for (const failure of failures) {
    process.stderr.write(`${failure.code}: ${failure.message}\n`)
  }
}

async function loadAppManifest(config: PumpedConfig, selectedApp?: string): Promise<GeneratedManifest> {
  const outDir = mkdtempSync(join(process.cwd(), ".pumped-graph-"))
  try {
    await viteBuild(
      inlineConfig(
        config,
        { logLevel: "silent", ...manifestConfig(manifestId("app"), outDir) },
        pumped({ ...(config.dir === undefined ? {} : { dir: config.dir }), app: selectedApp })
      )
    )
    return (await import(pathToFileURL(join(outDir, "manifest.mjs")).href)) as GeneratedManifest
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

async function dev(selectedApp?: string): Promise<void> {
  const config = await loadPumpedConfig()
  const app = selectedApp ?? config.app
  await withSelectedApp(app, async () => {
    const server = await createViteServer(
      inlineConfig(
        config,
        config.port === undefined ? {} : { server: { port: config.port } },
        pumped({ ...(config.dir === undefined ? {} : { dir: config.dir }), app })
      )
    )
    await server.listen()
    server.printUrls()
  })
}

async function build(target: Target, selectedApp?: string): Promise<void> {
  const config = await loadPumpedConfig()
  const app = selectedApp ?? config.app
  await withSelectedApp(app, async () => {
    const manifest = await loadAppManifest(config, app)
    const report = analyze(manifest)
    if (report.failures.length > 0) {
      reportFailures(report.failures)
      process.stderr.write(`pumped build refused: ${report.failures.length} failure(s)\n`)
      process.exitCode = 1
      return
    }

    if (target === "all") {
      rmSync(buildConfig("server", app).build.outDir, { recursive: true, force: true })
    }
    const targets: BuildTarget[] = target === "all" ? ["server", "cli"] : [target]
    await Promise.all(
      targets.map((buildTarget) => {
        const plan = planTarget(manifest, buildTarget)
        return viteBuild(
          inlineConfig(
            config,
            buildConfig(buildTarget, app),
            pumped({
              ...(config.dir === undefined ? {} : { dir: config.dir }),
              app,
              plan: { target: buildTarget, ...plan },
            })
          )
        )
      })
    )
  })
}

async function check(selectedApp?: string): Promise<void> {
  const config = await loadPumpedConfig()
  const app = selectedApp ?? config.app
  await withSelectedApp(app, async () => {
    const manifest = await loadAppManifest(config, app)
    const report = analyze(manifest)
    reportFailures(report.failures)
    process.stdout.write(
      `${report.failures.length} failure(s), ${report.unknowns.length} unknown(s), ${report.nodes.length} node(s)\n`
    )
    if (report.failures.length > 0) process.exitCode = 1
  })
}

async function graph(selectedApp?: string): Promise<void> {
  const config = await loadPumpedConfig()
  const app = selectedApp ?? config.app
  await withSelectedApp(app, async () => {
    const manifest = await loadAppManifest(config, app)
    const report = analyze(manifest)
    process.stdout.write(`${JSON.stringify({
      identity: manifest.identity,
      nodes: report.nodes,
      edges: report.edges,
      unknowns: report.unknowns,
      failures: report.failures,
    }, null, 2)}\n`)
    if (report.failures.length > 0) process.exitCode = 1
  })
}

const program = cac("pumped")

program
  .command("dev", "Start the dev server")
  .option("--app <app>", "named app from src/apps")
  .action(async (options: { app?: string }) => {
    await dev(options.app)
  })

function buildTargetOf(value: string): Target {
  if (value === "server" || value === "cli" || value === "all") return value
  throw new TypeError(`build target must be "server", "cli", or "all", received ${JSON.stringify(value)}`)
}

program
  .command("build", "Build server and/or cli bundles")
  .option("--target <target>", "server | cli | all", { default: "all" })
  .option("--app <app>", "named app from src/apps")
  .action(async (options: { target: string; app?: string }) => {
    await build(buildTargetOf(options.target), options.app)
  })

program
  .command("check", "Statically verify the selected app manifest")
  .option("--app <app>", "named app from src/apps")
  .action(async (options: { app?: string }) => {
    await check(options.app)
  })

program
  .command("graph", "Print the selected app manifest graph")
  .option("--app <app>", "named app from src/apps")
  .action(async (options: { app?: string }) => {
    await graph(options.app)
  })

program.help()
program.parse()
