#!/usr/bin/env node
import { cac } from "cac"
import { build as viteBuild, createServer as createViteServer, loadConfigFromFile } from "vite"
import { pumped } from "./plugin"
import { buildConfig } from "./build-config"

type Target = "server" | "cli" | "all"

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

program.help()
program.parse()
