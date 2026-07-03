import { pumpedHmr } from "@pumped-fn/lite-hmr"
import { getRequestListener } from "@hono/node-server"
import { isRunnableDevEnvironment, type Plugin, type RunnableDevEnvironment } from "vite"
import { discover } from "./discover"
import { generateManifest } from "./codegen"
import type { Manifest } from "./runtime/manifest"

export interface PumpedOptions {
  dir?: string
}

const MANIFEST_ID = "virtual:pumped/manifest"
const RESOLVED_MANIFEST_ID = "\0pumped:manifest"
const ENTRY_SERVER_ID = "virtual:pumped/entry-server"
const RESOLVED_ENTRY_SERVER_ID = "\0pumped:entry-server"
const ENTRY_CLI_ID = "virtual:pumped/entry-cli"
const RESOLVED_ENTRY_CLI_ID = "\0pumped:entry-cli"

export const ENTRY_SERVER_SOURCE = `
import { pumped } from "@pumped-fn/pumped"
import { serve } from "@hono/node-server"
import { app as manifestApp, entries } from ${JSON.stringify(MANIFEST_ID)}

const { app: honoApp } = pumped.createServer({ app: manifestApp, entries })
pumped.runJobs({ app: manifestApp, entries })
pumped.runWorkflows({ app: manifestApp, entries })
const port = Number(process.env.PORT ?? 3000)
serve({ fetch: honoApp.fetch, port })
`

export const ENTRY_CLI_SOURCE = `
import { pumped } from "@pumped-fn/pumped"
import { app as manifestApp, entries } from ${JSON.stringify(MANIFEST_ID)}

await pumped.runCli({ app: manifestApp, entries }, process.argv.slice(2))
`

export function pumped(options: PumpedOptions = {}): Plugin[] {
  const dir = options.dir ?? "src"
  let root = process.cwd()

  function sourceDir(): string {
    return `${root}/${dir}`
  }

  const appPlugin: Plugin = {
    name: "pumped-fn",

    configResolved(config) {
      root = config.root
    },

    resolveId(id) {
      if (id === MANIFEST_ID) return RESOLVED_MANIFEST_ID
      if (id === ENTRY_SERVER_ID) return RESOLVED_ENTRY_SERVER_ID
      if (id === ENTRY_CLI_ID) return RESOLVED_ENTRY_CLI_ID
      return undefined
    },

    load(id) {
      if (id === RESOLVED_MANIFEST_ID) {
        const { entries, appFile } = discover(sourceDir())
        return generateManifest(entries, appFile)
      }
      if (id === RESOLVED_ENTRY_SERVER_ID) return ENTRY_SERVER_SOURCE
      if (id === RESOLVED_ENTRY_CLI_ID) return ENTRY_CLI_SOURCE
      return undefined
    },

    configureServer(server) {
      let handlerPromise: Promise<(request: Request) => Promise<Response> | Response> | undefined

      if (!isRunnableDevEnvironment(server.environments.ssr)) {
        throw new Error("pumped-fn requires a runnable ssr environment")
      }
      const ssrEnvironment = server.environments.ssr as RunnableDevEnvironment

      async function loadHandler() {
        const module = (await ssrEnvironment.runner.import(MANIFEST_ID)) as Manifest
        const { createServer } = await import("./runtime/serve")
        return createServer(module).app.fetch
      }

      function invalidate() {
        const manifestModule = ssrEnvironment.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID)
        if (manifestModule) ssrEnvironment.moduleGraph.invalidateModule(manifestModule)
        handlerPromise = undefined
      }

      server.watcher.add(sourceDir())
      server.watcher.on("add", invalidate)
      server.watcher.on("unlink", invalidate)

      return () => {
        server.middlewares.use(async (request, response) => {
          handlerPromise ??= loadHandler()
          const fetchHandler = await handlerPromise
          getRequestListener(fetchHandler)(request, response)
        })
      }
    },
  }

  return [appPlugin, pumpedHmr()]
}
