import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, it, expect, afterEach } from "vitest"
import { graphFileName, hmrInspectPath, hmrMetaModule, hmrMetaPath, pumpedGraph, pumpedHmr, pumpedVite } from "../src/plugin"

type Middleware = (req: { url?: string }, res: Response, done: () => void) => void
type Unlink = (file: string) => void

class Response {
  statusCode = 0
  readonly headers = new Map<string, number | string | readonly string[]>()
  body = ""

  setHeader(name: string, value: number | string | readonly string[]): void {
    this.headers.set(name.toLowerCase(), value)
  }

  end(body?: string): void {
    this.body += body ?? ""
  }
}

describe("pumpedHmr plugin", () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it("has correct plugin name", () => {
    const plugin = pumpedHmr()
    expect(plugin.name).toBe("pumped-fn-hmr")
  })

  it("keeps client types aligned with the virtual module id", () => {
    const root = dirname(fileURLToPath(import.meta.url))
    const client = readFileSync(join(root, "../src/client.ts"), "utf8")

    expect(client).toContain(`declare module "${hmrMetaModule}"`)
  })

  it("enforces pre transform order", () => {
    const plugin = pumpedHmr()
    expect(plugin.enforce).toBe("pre")
  })

  it("only applies during Vite dev server runs", () => {
    const plugin = pumpedHmr()
    expect(plugin.apply).toBe("serve")
  })

  it("exposes a build-only graph metadata plugin", () => {
    const plugin = pumpedGraph()

    expect(plugin.name).toBe("pumped-fn-graph")
    expect(plugin.enforce).toBe("pre")
    expect(plugin.apply).toBe("build")
    expect(graphFileName).toBe("pumped-fn-lite.json")
  })

  it("composes the default dev Vite plugin set", () => {
    const plugins = pumpedVite()

    expect(plugins.map((plugin) => plugin.name)).toEqual(["pumped-fn-hmr"])
    expect(plugins.map((plugin) => plugin.apply)).toEqual(["serve"])
  })

  it("adds build graph metadata when explicitly enabled", () => {
    const plugins = pumpedVite({ graph: true })

    expect(plugins.map((plugin) => plugin.name)).toEqual(["pumped-fn-hmr", "pumped-fn-graph"])
    expect(plugins.map((plugin) => plugin.apply)).toEqual(["serve", "build"])
  })

  it("keeps the Vite plugin set opt-outs explicit", () => {
    expect(pumpedVite({ hmr: false, graph: true }).map((plugin) => plugin.name)).toEqual(["pumped-fn-graph"])
    expect(pumpedVite({ graph: false }).map((plugin) => plugin.name)).toEqual(["pumped-fn-hmr"])
    expect(pumpedVite({ hmr: false, graph: false })).toEqual([])
  })

  it("forwards graph options from the Vite plugin set", () => {
    const [plugin] = pumpedVite({ hmr: false, graph: { fileName: "lite-graph.json" } })
    const files: { fileName?: string }[] = []
    const generateBundle = plugin.generateBundle as Function

    generateBundle.call({
      emitFile: (file: { fileName?: string }) => files.push(file),
    })

    expect(files.map((file) => file.fileName)).toEqual(["lite-graph.json"])
  })

  it("does not disable dev transforms from NODE_ENV alone", async () => {
    process.env.NODE_ENV = "production"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)

    const result = await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => 1 })`,
      "src/atoms.ts"
    )

    expect(result).not.toBeNull()
    expect(result.code).toContain("__hmr_register")
  })

  it("skips non-JS/TS files", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)

    expect(await transform("const x = 1", "src/styles.css")).toBeNull()
    expect(await transform("const x = 1", "src/data.json")).toBeNull()
  })

  it("skips node_modules", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)

    const result = await transform(
      `const x = atom({ factory: () => 1 })`,
      "node_modules/@pumped-fn/lite/index.js"
    )

    expect(result).toBeNull()
  })

  it("skips files without Lite imports", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)

    const result = await transform(`const x = 1`, "src/utils.ts")

    expect(result).toBeNull()
  })

  it("transforms files with atom() calls", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)

    const result = await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )

    expect(result).not.toBeNull()
    expect(result.code).toContain("__hmr_register")
  })

  it("normalizes Vite query ids before include matching", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)

    const result = await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts?t=1"
    )

    expect(result).not.toBeNull()
    expect(result.meta.id).toBe("src/atoms.ts")
  })

  it("exposes compact handle metadata through a virtual module", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)
    const resolveId = plugin.resolveId as Function
    const load = plugin.load as Function

    await transform(
      `import { atom, flow } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })
const run = flow({ deps: { config }, factory: () => "ok" })`,
      "src/atoms.ts"
    )

    const resolved = resolveId(hmrMetaModule)
    const code = load(resolved) as string

    expect(resolved).toBe(`\0${hmrMetaModule}`)
    expect(code).toContain('"kind":"atom"')
    expect(code).toContain('"kind":"flow"')
    expect(code).toContain('"name":"config"')
    expect(code).toContain('"name":"run"')
    expect(code).toContain('"file":"src/atoms.ts"')
    expect(code).toContain("export const handles = meta.handles")
    expect(code).toContain("export const atoms = meta.atoms")
    expect(code).toContain("export const edges = meta.edges")
    expect(code).toContain("export const issues = meta.issues")
    expect(code).toContain('"fromName":"run"')
    expect(code).toContain('"toName":"config"')
    expect(code).toContain('"issues":[]')
  })

  it("exposes graph issues through the virtual module", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)
    const load = plugin.load as Function

    await transform(
      `import { flow } from '@pumped-fn/lite'
const local = makeLocal()
const run = flow({ deps: { local, config: makeConfig(local) }, factory: () => "ok" })`,
      "src/flow.ts"
    )

    const code = load(`\0${hmrMetaModule}`) as string

    expect(code).toContain('"code":"unknown-dep"')
    expect(code).toContain('"code":"dynamic-dep"')
    expect(code).toContain('"target":"local"')
    expect(code).toContain('"target":"makeConfig(local)"')
  })

  it("removes stale atom metadata when a module no longer transforms", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = transformWith(plugin)
    const load = plugin.load as Function

    await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )
    await transform("export const config = 1", "src/atoms.ts")

    const code = load(`\0${hmrMetaModule}`) as string

    expect(code).not.toContain('"name":"config"')
  })

  it("invalidates the virtual metadata module when atom metadata changes", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const next = server()

    configureServer(next.vite)

    await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )

    expect(next.invalidated).toEqual([next.mod.id])
  })

  it("does not invalidate metadata for unrelated modules", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const next = server()

    configureServer(next.vite)
    await transform("export const value = 1", "src/value.ts")

    expect(next.invalidated).toEqual([])
  })

  it("clears metadata when Vite reports a deleted source file", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const load = plugin.load as Function
    const next = server()

    configureServer(next.vite)
    await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )
    next.invalidated.length = 0
    next.unlink("src/atoms.ts")

    const code = load(`\0${hmrMetaModule}`) as string

    expect(next.invalidated).toEqual([next.mod.id])
    expect(code).not.toContain('"name":"config"')
  })

  it("refreshes metadata when Vite reports a changed Lite source file", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server()
    const source = { id: "src/atoms.ts" }

    configureServer(next.vite)
    await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )
    next.invalidated.length = 0

    const result = await update({
      file: "src/atoms.ts",
      read: async () => `import { atom, flow } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })
const run = flow({ deps: { config: make(config) }, factory: () => "ok" })`,
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toEqual([source, next.mod])
    expect(next.invalidated).toEqual([next.mod.id])
    expect(code).toContain('"name":"run"')
    expect(code).toContain('"code":"dynamic-dep"')
  })

  it("adds metadata when Vite reports a file that became Lite source", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server()
    const source = { id: "src/new.ts" }

    configureServer(next.vite)

    const result = await update({
      file: "src/new.ts",
      read: async () => `import { atom } from '@pumped-fn/lite'
const created = atom({ factory: () => 1 })`,
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toEqual([source, next.mod])
    expect(next.invalidated).toEqual([next.mod.id])
    expect(code).toContain('"name":"created"')
  })

  it("drops metadata when Vite reports a Lite source file no longer uses Lite", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server()
    const source = { id: "src/atoms.ts" }

    configureServer(next.vite)
    await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )
    next.invalidated.length = 0

    const result = await update({
      file: "src/atoms.ts",
      read: async () => "export const config = 1",
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toEqual([source, next.mod])
    expect(next.invalidated).toEqual([next.mod.id])
    expect(code).not.toContain('"name":"config"')
  })

  it("does not invalidate metadata when a Lite hot update has the same graph", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const update = plugin.handleHotUpdate as Function
    const next = server()
    const source = { id: "src/atoms.ts" }

    configureServer(next.vite)
    await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => 1 })`,
      "src/atoms.ts"
    )
    next.invalidated.length = 0

    const result = await update({
      file: "src/atoms.ts",
      read: async () => `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => 2 })`,
      server: next.vite,
      modules: [source],
    })

    expect(result).toBeUndefined()
    expect(next.invalidated).toEqual([])
  })

  it("drops query-normalized metadata during hot updates", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server()
    const source = { id: "src/atoms.ts" }

    configureServer(next.vite)
    await transform(
      `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`,
      "src/atoms.ts?t=1"
    )
    next.invalidated.length = 0

    const result = await update({
      file: "src/atoms.ts",
      read: async () => "export const config = 1",
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toEqual([source, next.mod])
    expect(next.invalidated).toEqual([next.mod.id])
    expect(code).not.toContain('"name":"config"')
  })

  it("syncs metadata without returning a missing virtual module", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server(false)
    const source = { id: "src/new.ts" }

    configureServer(next.vite)

    const result = await update({
      file: "src/new.ts",
      read: async () => `import { atom } from '@pumped-fn/lite'
const created = atom({ factory: () => 1 })`,
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toBeUndefined()
    expect(next.invalidated).toEqual([])
    expect(code).toContain('"name":"created"')
  })

  it("resolves imported deps during hot updates", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configResolved = plugin.configResolved as Function
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server(true, async (source: string) => ({
      id: source === "./next" ? "/project/src/next.ts" : "/project/src/external.ts",
    }))
    const source = { id: "src/flow.ts" }

    configResolved({ root: "/project" })
    configureServer(next.vite)
    await transform(
      `import { flow } from '@pumped-fn/lite'
import { external } from './external'
const run = flow({ deps: { external }, factory: () => "ok" })`,
      "src/flow.ts"
    )
    next.invalidated.length = 0

    const result = await update({
      file: "src/flow.ts",
      read: async () => `import { flow } from '@pumped-fn/lite'
import { external } from './next'
const run = flow({ deps: { external }, factory: () => "ok" })`,
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toEqual([source, next.mod])
    expect(next.invalidated).toEqual([next.mod.id])
    expect(code).toContain('"importSource":"./next"')
    expect(code).toContain('"importId":"src/next.ts"')
  })

  it("keeps resolved import ids stable across transform and hot update", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configResolved = plugin.configResolved as Function
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server(true, async () => ({ id: "/project/src/external.ts" }))
    const source = { id: "src/flow.ts" }

    configResolved({ root: "/project" })
    configureServer(next.vite)
    await transform(
      `import { flow } from '@pumped-fn/lite'
import { external } from './external'
const run = flow({ deps: { external }, factory: () => "ok" })`,
      "/project/src/flow.ts"
    )
    next.invalidated.length = 0

    const result = await update({
      file: "/project/src/flow.ts",
      read: async () => `import { flow } from '@pumped-fn/lite'
import { external } from './external'
const run = flow({ deps: { external }, factory: () => "ok" })`,
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toBeUndefined()
    expect(next.invalidated).toEqual([])
    expect(code).toContain('"file":"src/flow.ts"')
    expect(code).toContain('"importId":"src/external.ts"')
  })

  it("refreshes importer metadata when an imported target becomes resolvable", async () => {
    process.env.NODE_ENV = "development"
    let created = false
    const plugin = pumpedHmr()
    const configResolved = plugin.configResolved as Function
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const update = plugin.handleHotUpdate as Function
    const load = plugin.load as Function
    const next = server(true, async () => created ? { id: "/project/src/external.ts" } : undefined)
    const source = { id: "src/external.ts" }

    configResolved({ root: "/project" })
    configureServer(next.vite)
    await transform(
      `import { flow } from '@pumped-fn/lite'
import { external } from './external'
const run = flow({ deps: { external }, factory: () => "ok" })`,
      "src/flow.ts"
    )
    created = true
    next.invalidated.length = 0

    const result = await update({
      file: "src/external.ts",
      read: async () => "export const external = {}",
      server: next.vite,
      modules: [source],
    })
    const code = load(`\0${hmrMetaModule}`) as string

    expect(result).toEqual([source, next.mod])
    expect(next.invalidated).toEqual([next.mod.id])
    expect(code).toContain('"importId":"src/external.ts"')
  })

  it("serves JSON metadata for external devtools", async () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const transform = transformWith(plugin)
    const next = server()

    configureServer(next.vite)
    await transform(
      `import { atom, flow } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })
const run = flow({ deps: { config }, factory: () => "ok" })`,
      "src/atoms.ts"
    )

    const res = new Response()
    let passed = false
    next.middleware()({ url: hmrMetaPath }, res, () => {
      passed = true
    })
    const meta = JSON.parse(res.body) as {
      handles: { kind: string; name: string }[]
      atoms: { name: string }[]
      edges: { fromName: string; toName: string; slot: string }[]
      issues: unknown[]
    }

    expect(passed).toBe(false)
    expect(res.statusCode).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/json; charset=utf-8")
    expect(meta.handles.map((handle) => [handle.kind, handle.name])).toEqual([
      ["atom", "config"],
      ["flow", "run"],
    ])
    expect(meta.atoms.map((atom) => atom.name)).toEqual(["config"])
    expect(meta.edges.map((edge) => [edge.fromName, edge.slot, edge.toName])).toEqual([
      ["run", "config", "config"],
    ])
    expect(meta.issues).toEqual([])
  })

  it("serves a compact inspector page for the metadata endpoint", () => {
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const next = server()
    const res = new Response()

    configureServer(next.vite)
    next.middleware()({ url: hmrInspectPath }, res, () => {
      throw new Error("unexpected pass")
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8")
    expect(res.body).toContain("Pumped Lite HMR")
    expect(res.body).toContain(`fetch("${hmrMetaPath}")`)
    expect(res.body).toContain("<h2>Deps</h2>")
    expect(res.body).toContain("<h2>Issues</h2>")
    expect(res.body).toContain("meta.edges.length")
    expect(res.body).toContain("meta.issues.length")
  })

  it("passes unrelated dev-server requests through", () => {
    const plugin = pumpedHmr()
    const configureServer = plugin.configureServer as Function
    const next = server()
    const res = new Response()
    let passed = false

    configureServer(next.vite)
    next.middleware()({ url: "/src/main.ts" }, res, () => {
      passed = true
    })

    expect(passed).toBe(true)
    expect(res.body).toBe("")
  })
})

function server(
  hasMetaModule = true,
  resolveId: (source: string, importer?: string) => Promise<{ id: string } | undefined> = async () => undefined
) {
  let middleware: Middleware | undefined
  let unlink: Unlink | undefined
  const invalidated: string[] = []
  const mod = { id: `\0${hmrMetaModule}` }
  return {
    mod,
    invalidated,
    middleware: () => {
      if (!middleware) throw new Error("middleware not configured")
      return middleware
    },
    unlink: (file: string) => {
      if (!unlink) throw new Error("unlink watcher not configured")
      unlink(file)
    },
    vite: {
      watcher: {
        on: (event: string, next: Unlink) => {
          if (event === "unlink") unlink = next
        },
      },
      middlewares: {
        use: (next: Middleware) => {
          middleware = next
        },
      },
      moduleGraph: {
        getModuleById: (id: string) => hasMetaModule && id === mod.id ? mod : undefined,
        invalidateModule: (target: typeof mod) => invalidated.push(target.id),
      },
      pluginContainer: {
        resolveId,
      },
    },
  }
}

function transformWith(plugin: ReturnType<typeof pumpedHmr>) {
  const transform = plugin.transform as (
    this: { resolve(source: string, importer: string, options: { skipSelf: boolean }): Promise<{ id: string } | undefined> },
    code: string,
    id: string
  ) => unknown
  return (code: string, id: string) => transform.call({
    resolve: async () => undefined,
  }, code, id)
}
