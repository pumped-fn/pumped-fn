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

async function dev(): Promise<void> {
  const server = await createViteServer(
    (await hasUserConfig()) ? {} : { plugins: [pumped()] }
  )
  await server.listen()
  server.printUrls()
}

async function buildTarget(target: "server" | "cli"): Promise<void> {
  const userConfig = (await hasUserConfig()) ? {} : { plugins: [pumped()] }

  await viteBuild({ ...userConfig, ...buildConfig(target) })
}

async function build(target: Target): Promise<void> {
  if (target === "server" || target === "all") await buildTarget("server")
  if (target === "cli" || target === "all") await buildTarget("cli")
}

const program = cac("pumped")

program.command("dev", "Start the dev server").action(dev)

program
  .command("build", "Build server and/or cli bundles")
  .option("--target <target>", "server | cli | all", { default: "all" })
  .action(async (options: { target: Target }) => {
    await build(options.target)
  })

program.help()
program.parse()
