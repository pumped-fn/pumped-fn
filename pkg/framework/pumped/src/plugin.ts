import { createHash } from "node:crypto"
import { isAbsolute, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { pumpedHmr } from "@pumped-fn/lite-hmr"
import { getRequestListener } from "@hono/node-server"
import { isRunnableDevEnvironment, type Plugin, type RunnableDevEnvironment } from "vite"
import type { Lite } from "@pumped-fn/lite"
import { discover, selectAppFile } from "./discover"
import { generateManifest } from "./codegen"
import type { BuildTarget, HostName, TargetPlan } from "./build-config"
import { createDevRunner } from "./runtime/dev-runner"
import type { Manifest } from "./runtime/manifest"

export interface PumpedOptions {
  dir?: string
  app?: string
  plan?: TargetPlan & { target: BuildTarget }
}

const MANIFEST_APP_ID = "virtual:pumped/manifest/app"
const RESOLVED_MANIFEST_APP_ID = "\0pumped:manifest/app"
const MANIFEST_SERVER_ID = "virtual:pumped/manifest/server"
const RESOLVED_MANIFEST_SERVER_ID = "\0pumped:manifest/server"
const MANIFEST_CLI_ID = "virtual:pumped/manifest/cli"
const RESOLVED_MANIFEST_CLI_ID = "\0pumped:manifest/cli"
const ENTRY_SERVER_ID = "virtual:pumped/entry-server"
const RESOLVED_ENTRY_SERVER_ID = "\0pumped:entry-server"
const ENTRY_CLI_ID = "virtual:pumped/entry-cli"
const RESOLVED_ENTRY_CLI_ID = "\0pumped:entry-cli"

const frameworkRoot = fileURLToPath(new URL("..", import.meta.url)).replaceAll("\\", "/")

export function manifestId(target: "app" | BuildTarget): string {
  if (target === "app") return MANIFEST_APP_ID
  return target === "server" ? MANIFEST_SERVER_ID : MANIFEST_CLI_ID
}

export function entryServerSource(hosts: readonly HostName[]): string {
  const serverHosts = (["http", "cron", "workflow"] as const).filter((host) => hosts.includes(host))
  const hostImports = serverHosts.map((host) => `${host}Host`)
  const backgroundHosts = serverHosts.filter((host) => host !== "http")
  return [
    `import { createScope } from "@pumped-fn/lite"`,
    ...(hostImports.length > 0 ? [`import { ${hostImports.join(", ")} } from "@pumped-fn/pumped"`] : []),
    `import { app, entries, identity } from ${JSON.stringify(MANIFEST_SERVER_ID)}`,
    "",
    "const manifest = { identity, app, entries }",
    "const scope = createScope(app ?? {})",
    ...(serverHosts.includes("http")
      ? [
          'const parsedPort = Number.parseInt(process.env.PORT ?? "", 10)',
          "const port = Number.isNaN(parsedPort) ? 3000 : parsedPort",
        ]
      : []),
    "const runtimes = [",
    ...backgroundHosts.map((host) => `  ${host}Host.start({ scope, manifest }),`),
    "]",
    "await Promise.all(runtimes.map((runtime) => runtime.ready))",
    ...(serverHosts.includes("http") ? ["await httpHost.start({ scope, manifest, port }).ready"] : []),
    "let closing = false",
    "const shutdown = () => {",
    "  if (closing) return",
    "  closing = true",
    "  scope.dispose().catch((error) => {",
    "    console.error(error)",
    "    process.exitCode = 1",
    "  })",
    "}",
    'process.once("SIGINT", shutdown)',
    'process.once("SIGTERM", shutdown)',
    "",
  ].join("\n")
}

export function entryCliSource(): string {
  return [
    `import { createScope } from "@pumped-fn/lite"`,
    `import { cliHost } from "@pumped-fn/pumped"`,
    `import { app, entries, identity } from ${JSON.stringify(MANIFEST_CLI_ID)}`,
    "",
    "const manifest = { identity, app, entries }",
    "const scope = createScope(app ?? {})",
    "const runtime = cliHost.start({ scope, manifest, argv: process.argv.slice(2) })",
    "const code = await runtime.code",
    "await scope.dispose()",
    "process.exitCode = code",
    "",
  ].join("\n")
}

export function pumped(options: PumpedOptions = {}): Plugin[] {
  const dir = options.dir ?? "src"
  const selectedApp = options.app ?? process.env["PUMPED_APP"]
  const plan = options.plan
  let root = process.cwd()
  let generatedManifest: { id: string; hash: string } | undefined

  function sourceDir(): string {
    return `${root}/${dir}`
  }

  function logicalFile(file: string): string {
    return relative(root, file).replaceAll("\\", "/")
  }

  const appPlugin: Plugin = {
    name: "pumped-fn",

    config(userConfig, env) {
      if (userConfig.appType !== undefined && userConfig.appType !== "custom") {
        this.warn(
          `pumped overrides Vite appType "${userConfig.appType}" with "custom" because pumped owns the request pipeline`
        )
      }
      return {
        appType: "custom",
        ssr:
          env.command === "build" && plan !== undefined
            ? {
                external: ["@pumped-fn/lite", "hono", "@hono/node-server", "@pumped-fn/lite-extension-scheduler"],
                noExternal: [/^@pumped-fn\/pumped(\/|$)/],
              }
            : {
                external: [
                  "@pumped-fn/pumped",
                  "@pumped-fn/lite",
                  "@pumped-fn/lite-extension-scheduler",
                ],
              },
      }
    },

    configResolved(config) {
      root = config.root
    },

    resolveId(id) {
      if (id === MANIFEST_APP_ID) return RESOLVED_MANIFEST_APP_ID
      if (id === MANIFEST_SERVER_ID) return RESOLVED_MANIFEST_SERVER_ID
      if (id === MANIFEST_CLI_ID) return RESOLVED_MANIFEST_CLI_ID
      if (id === ENTRY_SERVER_ID) return RESOLVED_ENTRY_SERVER_ID
      if (id === ENTRY_CLI_ID) return RESOLVED_ENTRY_CLI_ID
      return undefined
    },

    load(id) {
      if (id === RESOLVED_MANIFEST_APP_ID || id === RESOLVED_MANIFEST_SERVER_ID || id === RESOLVED_MANIFEST_CLI_ID) {
        const discovery = discover(sourceDir())
        const target = id === RESOLVED_MANIFEST_APP_ID ? "app" : id === RESOLVED_MANIFEST_SERVER_ID ? "server" : "cli"
        const entries =
          target === "app" || plan === undefined || plan.target !== target
            ? discovery.entries
            : discovery.entries.filter((entry) => plan.files.includes(logicalFile(entry.file)))
        const { source, identity } = generateManifest(entries, selectAppFile(discovery, selectedApp), {
          root,
          app: selectedApp ?? "default",
          target,
        })
        generatedManifest = { id, hash: identity.hash }
        return source
      }
      if (id === RESOLVED_ENTRY_SERVER_ID) {
        return entryServerSource(plan?.target === "server" ? plan.hosts : ["http", "cron", "workflow"])
      }
      if (id === RESOLVED_ENTRY_CLI_ID) return entryCliSource()
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
        const normalizedId = id.replaceAll("\\", "/")
        if (normalizedId.includes("/node_modules/")) return
        if (normalizedId.startsWith(frameworkRoot) && !normalizedId.startsWith(`${normalizedRoot}/`)) return
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
        fetch: (request: Request) => Promise<Response>
        scope: Lite.Scope
      }

      if (!isRunnableDevEnvironment(server.environments.ssr)) {
        throw new Error("pumped-fn requires a runnable ssr environment")
      }
      const ssrEnvironment = server.environments.ssr as RunnableDevEnvironment

      async function loadDevApp(): Promise<DevApp> {
        const manifest = (await ssrEnvironment.runner.import(MANIFEST_APP_ID)) as Manifest
        const { createScope } = await import("@pumped-fn/lite")
        const { analyze } = await import("./analyze")
        const { selectEntries } = await import("./hosts/host")
        const { httpHost } = await import("./hosts/http")
        const { cronHost } = await import("./hosts/cron")
        const { workflowHost } = await import("./hosts/workflow")

        for (const failure of analyze(manifest).failures) {
          server.config.logger.error(`pumped check: ${failure.message}`)
        }

        const scope = createScope(manifest.app ?? {})
        try {
          const waits: Promise<void>[] = []
          let fetch: DevApp["fetch"] = async () =>
            new Response(JSON.stringify({ error: "no route entries in this app" }), {
              status: 404,
              headers: { "content-type": "application/json" },
            })
          if (selectEntries(manifest, httpHost.selector).length > 0) {
            const http = httpHost.start({ scope, manifest })
            waits.push(http.ready)
            fetch = http.fetch
          }
          if (selectEntries(manifest, cronHost.selector).length > 0) {
            waits.push(cronHost.start({ scope, manifest }).ready)
          }
          if (selectEntries(manifest, workflowHost.selector).length > 0) {
            waits.push(workflowHost.start({ scope, manifest }).ready)
          }
          await Promise.all(waits)
          return { fetch, scope }
        } catch (error) {
          await scope.dispose()
          throw error
        }
      }

      async function disposeDevApp(devApp: DevApp): Promise<void> {
        await devApp.scope.dispose()
      }

      const runner = createDevRunner(loadDevApp, disposeDevApp)

      function reportDevError(error: unknown) {
        server.config.logger.error(error instanceof Error ? (error.stack ?? error.message) : String(error), {
          error: error instanceof Error ? error : undefined,
        })
      }

      function invalidate() {
        const manifestModule = ssrEnvironment.moduleGraph.getModuleById(RESOLVED_MANIFEST_APP_ID)
        if (manifestModule) ssrEnvironment.moduleGraph.invalidateModule(manifestModule)
        runner.invalidate()
        runner.get().catch(reportDevError)
      }

      server.watcher.add(sourceDir())
      server.watcher.on("add", invalidate)
      server.watcher.on("unlink", invalidate)
      server.watcher.on("change", invalidate)

      runner.get().catch(reportDevError)

      server.httpServer?.on("close", () => {
        void runner.disposeCurrent()
      })

      const listener = getRequestListener(async (request) => {
        const devApp = await runner.get()
        return devApp.fetch(request)
      })

      return () => {
        server.middlewares.use(async (request, response) => {
          try {
            await listener(request, response)
          } catch (error) {
            reportDevError(error)
            if (!response.headersSent) response.writeHead(500, { "content-type": "application/json" })
            if (!response.writableEnded) {
              response.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }))
            }
          }
        })
      }
    },
  }

  return [appPlugin, pumpedHmr()]
}
