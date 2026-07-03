import { pumpedHmr } from "@pumped-fn/lite-hmr"
import { getRequestListener } from "@hono/node-server"
import { isRunnableDevEnvironment, type Plugin, type RunnableDevEnvironment } from "vite"
import type { Lite } from "@pumped-fn/lite"
import { discover } from "./discover"
import { generateManifest } from "./codegen"
import { createDevRunner } from "./runtime/dev-runner"
import type { Manifest } from "./runtime/manifest"
import type { JobsRunner } from "./runtime/jobs"
import type { WorkflowsRunner } from "./runtime/workflows"

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
import { hono } from "@pumped-fn/lite-hono"
import { serve } from "@hono/node-server"
import { app as manifestApp, entries } from ${JSON.stringify(MANIFEST_ID)}

const manifest = { app: manifestApp, entries }
const lite = hono.adapter()
const scope = pumped.createAppScope(manifest, [lite])
const { app: honoApp } = pumped.createServer(manifest, { scope, lite })
pumped.runJobs(manifest, undefined, scope)
pumped.runWorkflows(manifest, undefined, scope)
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

    config() {
      return {
        ssr: {
          external: ["@pumped-fn/pumped", "@pumped-fn/lite", "@pumped-fn/lite-hono"],
        },
      }
    },

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
      interface DevApp {
        fetch: (request: Request) => Promise<Response> | Response
        scope: Lite.Scope
        jobs: JobsRunner
        workflows: WorkflowsRunner
      }

      if (!isRunnableDevEnvironment(server.environments.ssr)) {
        throw new Error("pumped-fn requires a runnable ssr environment")
      }
      const ssrEnvironment = server.environments.ssr as RunnableDevEnvironment

      async function loadDevApp(): Promise<DevApp> {
        const manifest = (await ssrEnvironment.runner.import(MANIFEST_ID)) as Manifest
        const { createServer } = await import("./runtime/serve")
        const { runJobs } = await import("./runtime/jobs")
        const { runWorkflows } = await import("./runtime/workflows")
        const { createAppScope } = await import("./runtime/app-scope")
        const { hono } = await import("@pumped-fn/lite-hono")

        const lite = hono.adapter()
        const scope = createAppScope(manifest, [lite])
        const { app } = createServer(manifest, { scope, lite })
        const jobs = runJobs(manifest, undefined, scope)
        const workflows = runWorkflows(manifest, undefined, scope)

        return { fetch: app.fetch, scope, jobs, workflows }
      }

      async function disposeDevApp(devApp: DevApp): Promise<void> {
        await devApp.jobs.stop()
        await devApp.workflows.stop()
        await devApp.scope.dispose()
      }

      const runner = createDevRunner(loadDevApp, disposeDevApp)

      function invalidate() {
        const manifestModule = ssrEnvironment.moduleGraph.getModuleById(RESOLVED_MANIFEST_ID)
        if (manifestModule) ssrEnvironment.moduleGraph.invalidateModule(manifestModule)
        runner.invalidate()
      }

      server.watcher.add(sourceDir())
      server.watcher.on("add", invalidate)
      server.watcher.on("unlink", invalidate)
      server.watcher.on("change", invalidate)

      runner.get().catch((error) => {
        server.config.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error), {
          error: error instanceof Error ? error : undefined,
        })
      })

      server.httpServer?.on("close", () => {
        void runner.disposeCurrent()
      })

      return () => {
        server.middlewares.use(async (request, response) => {
          const devApp = await runner.get()
          getRequestListener(devApp.fetch)(request, response)
        })
      }
    },
  }

  return [appPlugin, pumpedHmr()]
}
