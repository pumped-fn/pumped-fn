import { createHash } from "node:crypto"
import { isAbsolute, relative } from "node:path"
import { pumpedHmr } from "@pumped-fn/lite-hmr"
import { getRequestListener } from "@hono/node-server"
import { isRunnableDevEnvironment, type Plugin, type RunnableDevEnvironment } from "vite"
import type { Lite } from "@pumped-fn/lite"
import { discover, selectAppFile } from "./discover"
import { generateManifest } from "./codegen"
import { selectTargetEntries, type BuildTarget } from "./build-config"
import { createDevRunner } from "./runtime/dev-runner"
import type { Manifest } from "./runtime/manifest"
import type { JobsRunner } from "./runtime/jobs"
import type { WorkflowsRunner } from "./runtime/workflows"

export interface PumpedOptions {
  dir?: string
  app?: string
}

const MANIFEST_SERVER_ID = "virtual:pumped/manifest/server"
const RESOLVED_MANIFEST_SERVER_ID = "\0pumped:manifest/server"
const MANIFEST_CLI_ID = "virtual:pumped/manifest/cli"
const RESOLVED_MANIFEST_CLI_ID = "\0pumped:manifest/cli"
const ENTRY_SERVER_ID = "virtual:pumped/entry-server"
const RESOLVED_ENTRY_SERVER_ID = "\0pumped:entry-server"
const ENTRY_CLI_ID = "virtual:pumped/entry-cli"
const RESOLVED_ENTRY_CLI_ID = "\0pumped:entry-cli"

export function manifestId(target: BuildTarget): string {
  return target === "server" ? MANIFEST_SERVER_ID : MANIFEST_CLI_ID
}

export const ENTRY_SERVER_SOURCE = `
import { pumped } from "@pumped-fn/pumped"
import { hono } from "@pumped-fn/lite-hono"
import { serve } from "@hono/node-server"
import { app as manifestApp, entries, identity } from ${JSON.stringify(MANIFEST_SERVER_ID)}

const manifest = { identity, app: manifestApp, entries }
const lite = hono.adapter()
const scope = pumped.createAppScope(manifest, [lite])
const { app: honoApp } = pumped.createServer(manifest, { scope, lite })
const jobs = pumped.runJobs(manifest, undefined, scope)
pumped.runWorkflows(manifest, undefined, scope)
await jobs.ready
const port = Number(process.env.PORT ?? 3000)
serve({ fetch: honoApp.fetch, port })
`

export const ENTRY_CLI_SOURCE = `
import { pumped } from "@pumped-fn/pumped"
import { app as manifestApp, entries, identity } from ${JSON.stringify(MANIFEST_CLI_ID)}

await pumped.runCli({ identity, app: manifestApp, entries }, process.argv.slice(2))
`

export function pumped(options: PumpedOptions = {}): Plugin[] {
  const dir = options.dir ?? "src"
  const selectedApp = options.app ?? process.env["PUMPED_APP"]
  let root = process.cwd()
  let generatedManifest: { id: string; hash: string } | undefined

  function sourceDir(): string {
    return `${root}/${dir}`
  }

  const appPlugin: Plugin = {
    name: "pumped-fn",

    config() {
      return {
        ssr: {
          external: [
            "@pumped-fn/pumped",
            "@pumped-fn/lite",
            "@pumped-fn/lite-hono",
            "@pumped-fn/lite-extension-scheduler",
          ],
        },
      }
    },

    configResolved(config) {
      root = config.root
    },

    resolveId(id) {
      if (id === MANIFEST_SERVER_ID) return RESOLVED_MANIFEST_SERVER_ID
      if (id === MANIFEST_CLI_ID) return RESOLVED_MANIFEST_CLI_ID
      if (id === ENTRY_SERVER_ID) return RESOLVED_ENTRY_SERVER_ID
      if (id === ENTRY_CLI_ID) return RESOLVED_ENTRY_CLI_ID
      return undefined
    },

    load(id) {
      if (id === RESOLVED_MANIFEST_SERVER_ID || id === RESOLVED_MANIFEST_CLI_ID) {
        const discovery = discover(sourceDir())
        const target = id === RESOLVED_MANIFEST_SERVER_ID ? "server" : "cli"
        const source = generateManifest(
          selectTargetEntries(discovery.entries, target),
          selectAppFile(discovery, selectedApp),
          { root, app: selectedApp ?? "default", target }
        )
        generatedManifest = { id, hash: source.match(/sha256:[a-f0-9]{64}/)![0] }
        return source
      }
      if (id === RESOLVED_ENTRY_SERVER_ID) return ENTRY_SERVER_SOURCE
      if (id === RESOLVED_ENTRY_CLI_ID) return ENTRY_CLI_SOURCE
      return undefined
    },

    renderChunk(code) {
      const manifest = generatedManifest
      if (!manifest || !code.includes(manifest.hash)) return null
      const modules: { id: string; code: string }[] = []
      const absoluteIds: string[] = []
      const visited = new Set<string>()
      const normalizedRoot = root.replaceAll("\\", "/")
      const visit = (id: string): void => {
        if (visited.has(id)) return
        visited.add(id)
        const module = this.getModuleInfo(id)
        if (!module) return
        if (isAbsolute(id)) absoluteIds.push(id)
        modules.push({
          id: id === manifest.id
            ? id
            : isAbsolute(id)
              ? relative(root, id).replaceAll("\\", "/")
              : id,
          code: module.code ?? "",
        })
        for (const imported of [...module.importedIds, ...module.dynamicallyImportedIds]) visit(imported)
      }
      visit(manifest.id)
      absoluteIds.sort((left, right) => right.length - left.length)
      for (const module of modules) {
        module.code = module.code.replaceAll("\\", "/")
        for (const id of absoluteIds) {
          module.code = module.code.replaceAll(
            id.replaceAll("\\", "/"),
            relative(root, id).replaceAll("\\", "/")
          )
        }
        module.code = module.code.replaceAll(normalizedRoot, "<root>")
      }
      modules.sort((left, right) => left.id.localeCompare(right.id))
      const hash = `sha256:${createHash("sha256").update(JSON.stringify(modules)).digest("hex")}`
      return { code: code.replaceAll(manifest.hash, hash), map: null }
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
        const manifest = (await ssrEnvironment.runner.import(MANIFEST_SERVER_ID)) as Manifest
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

        try {
          await jobs.ready
        } catch (error) {
          await Promise.allSettled([jobs.stop(), workflows.stop()])
          await scope.dispose()
          throw error
        }

        return { fetch: app.fetch, scope, jobs, workflows }
      }

      async function disposeDevApp(devApp: DevApp): Promise<void> {
        await devApp.jobs.stop()
        await devApp.workflows.stop()
        await devApp.scope.dispose()
      }

      const runner = createDevRunner(loadDevApp, disposeDevApp)

      function invalidate() {
        const manifestModule = ssrEnvironment.moduleGraph.getModuleById(RESOLVED_MANIFEST_SERVER_ID)
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
