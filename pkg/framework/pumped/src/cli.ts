#!/usr/bin/env node
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { cac } from "cac"
import { build as viteBuild, createServer as createViteServer, loadConfigFromFile } from "vite"
import { analyze } from "./analyze"
import { buildConfig, type BuildTarget } from "./build-config"
import { manifestId, pumped } from "./plugin"
import type { Manifest, ManifestIdentity } from "./runtime/manifest"

type Target = "server" | "cli" | "all"
type GeneratedManifest = Manifest & { identity: ManifestIdentity }

async function hasUserConfig(): Promise<boolean> {
  const config = await loadConfigFromFile({ command: "serve", mode: "development" })
  return config !== null
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

async function dev(selectedApp?: string): Promise<void> {
  await withSelectedApp(selectedApp, async () => {
    const server = await createViteServer(
      (await hasUserConfig()) ? {} : { plugins: [pumped({ app: selectedApp })] }
    )
    await server.listen()
    server.printUrls()
  })
}

async function buildTarget(target: "server" | "cli", selectedApp?: string): Promise<void> {
  const userConfig = (await hasUserConfig()) ? {} : { plugins: [pumped({ app: selectedApp })] }

  await viteBuild({ ...userConfig, ...buildConfig(target, selectedApp) })
}

async function build(target: Target, selectedApp?: string): Promise<void> {
  await withSelectedApp(selectedApp, async () => {
    if (target === "server" || target === "all") await buildTarget("server", selectedApp)
    if (target === "cli" || target === "all") await buildTarget("cli", selectedApp)
  })
}

async function loadManifest(target: BuildTarget, selectedApp?: string): Promise<GeneratedManifest> {
  const outDir = mkdtempSync(join(process.cwd(), ".pumped-graph-"))
  try {
    const userConfig = (await hasUserConfig()) ? {} : { plugins: [pumped({ app: selectedApp })] }
    await viteBuild({
      ...userConfig,
      logLevel: "silent",
      ssr: { noExternal: true },
      build: {
        ssr: true,
        outDir,
        emptyOutDir: true,
        rollupOptions: {
          input: manifestId(target),
          output: { entryFileNames: "manifest.mjs" },
        },
      },
    })
    return await import(pathToFileURL(join(outDir, "manifest.mjs")).href) as GeneratedManifest
  } finally {
    rmSync(outDir, { recursive: true, force: true })
  }
}

async function graph(target: BuildTarget, selectedApp?: string): Promise<void> {
  await withSelectedApp(selectedApp, async () => {
    const manifest = await loadManifest(target, selectedApp)
    const report = analyze(manifest)
    process.stdout.write(`${JSON.stringify({
      identity: manifest.identity,
      nodes: report.nodes,
      edges: report.edges,
      unknowns: report.unknowns,
    }, null, 2)}\n`)
  })
}

function graphTarget(value: string): BuildTarget {
  if (value === "server" || value === "cli") return value
  throw new TypeError(`graph target must be "server" or "cli", received ${JSON.stringify(value)}`)
}

const program = cac("pumped")

program
  .command("dev", "Start the dev server")
  .option("--app <app>", "named app from src/apps")
  .action(async (options: { app?: string }) => {
    await dev(options.app)
  })

program
  .command("build", "Build server and/or cli bundles")
  .option("--target <target>", "server | cli | all", { default: "all" })
  .option("--app <app>", "named app from src/apps")
  .action(async (options: { target: Target; app?: string }) => {
    await build(options.target, options.app)
  })

program
  .command("graph", "Print the selected app manifest graph")
  .option("--target <target>", "server | cli", { default: "server" })
  .option("--app <app>", "named app from src/apps")
  .action(async (options: { target: string; app?: string }) => {
    await graph(graphTarget(options.target), options.app)
  })

program.help()
program.parse()
