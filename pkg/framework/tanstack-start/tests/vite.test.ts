import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { build, createServer, parseAst, type Plugin, type ViteDevServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { boundary, tanstackStartBoundary } from "../src/vite"

const roots: string[] = []
const servers: ViteDevServer[] = []

afterEach(async () => {
  for (const server of servers.splice(0)) {
    await server.close()
  }
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("TanStack Start boundary Vite plugin", () => {
  it("exposes stable plugin factories", () => {
    expect(boundary().name).toBe("pumped-fn-tanstack-start-boundary")
    expect(tanstackStartBoundary().name).toBe("pumped-fn-tanstack-start-boundary")
  })

  it("keeps watch build records across cached rebuilds", () => {
    expect(boundary()).not.toHaveProperty("buildStart")
  })

  it("rejects runtime adapter imports from client entry modules", async () => {
    const root = fixture({
      "src/client.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        console.log(tanstackStart)
      `,
    })

    await expect(run(root)).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })

  it("rejects deep runtime adapter imports from client entry modules", async () => {
    const root = fixture({
      "src/client.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start/deep.js"
        console.log(tanstackStart)
      `,
    })

    await expect(run(root)).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })

  it("rejects runtime adapter imports through Vite aliases", async () => {
    const root = fixture({
      "src/client.ts": `
        import { tanstackStart } from "start-adapter"
        console.log(tanstackStart)
      `,
    })

    await expect(run(root, undefined, {
      alias: {
        "start-adapter": join(root, "node_modules/@pumped-fn/lite-tanstack-start/index.js"),
      },
    })).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })

  it("rejects dynamic runtime adapter imports from client entry modules", async () => {
    const root = fixture({
      "src/client.ts": `
        export async function load() {
          return import("@pumped-fn/lite-tanstack-start")
        }
      `,
    })

    await expect(run(root)).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })

  it("allows type-only imports from client entry modules", async () => {
    const root = fixture({
      "src/client.ts": `
        import type { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        type Adapter = typeof tanstackStart
        export const ok = "client" satisfies string
        console.log(ok)
      `,
    })

    await expect(run(root)).resolves.toBeUndefined()
  })

  it("ignores import-like text in client string literals", async () => {
    const root = fixture({
      "src/client.ts": `
        const note = 'import { tanstackStart } from "@pumped-fn/lite-tanstack-start"'
        console.log(note)
      `,
    })

    await expect(run(root)).resolves.toBeUndefined()
  })

  it("rejects client reachability through mixed barrels", async () => {
    const root = fixture({
      "src/client.ts": `
        import { request } from "./index"
        console.log(request)
      `,
      "src/index.ts": `export { request } from "./start"`,
      "src/start.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })

    await expect(run(root)).rejects.toThrow("reaches TanStack Start backend boundary")
  })

  it("allows client imports of server-function bridge modules", async () => {
    const root = fixture({
      "src/client.ts": `
        import { listTodos } from "./todos.functions"
        console.log(listTodos)
      `,
      "src/todos.functions.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const listTodos = tanstackStart.contextKey
      `,
    })

    await expect(run(root)).resolves.toBeUndefined()
  })

  it("rejects runtime re-exports from client-reachable server-function bridge modules", async () => {
    const root = fixture({
      "src/client.ts": `
        import { tanstackStart } from "./todos.functions"
        console.log(tanstackStart)
      `,
      "src/todos.functions.ts": `
        export { tanstackStart } from "@pumped-fn/lite-tanstack-start"
      `,
    })

    await expect(run(root)).rejects.toThrow("Runtime re-export of @pumped-fn/lite-tanstack-start can leak")
  })

  it("treats route modules as client-reachable by default", async () => {
    const root = fixture({
      "src/client.ts": `console.log("client")`,
      "src/routes/index.tsx": `
        import { request } from "../start"
        export const route = request
      `,
      "src/start.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })

    await expect(run(root, undefined, {
      input: join(root, "src/routes/index.tsx"),
    })).rejects.toThrow("reaches TanStack Start backend boundary")
  })

  it("allows server API routes to use the runtime adapter", async () => {
    const root = fixture({
      "src/client.ts": `console.log("client")`,
      "src/routes/api/health.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })

    await expect(run(root, undefined, {
      input: {
        client: join(root, "src/client.ts"),
        health: join(root, "src/routes/api/health.ts"),
      },
    })).resolves.toBeUndefined()
  })

  it("rejects flat api page routes as client routes", async () => {
    const root = fixture({
      "src/routes/api.tsx": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const route = tanstackStart.contextKey
      `,
    })

    await expect(run(root, undefined, {
      input: join(root, "src/routes/api.tsx"),
    })).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })

  it("rejects flat api resource page routes as client routes", async () => {
    const root = fixture({
      "src/routes/api.users.tsx": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const route = tanstackStart.contextKey
      `,
    })

    await expect(run(root, undefined, {
      input: join(root, "src/routes/api.users.tsx"),
    })).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })

  it("allows server API routes to import server helpers", async () => {
    const root = fixture({
      "src/client.ts": `console.log("client")`,
      "src/routes/api/health.ts": `
        import { request } from "../../lib/request.server"
        export const health = request
      `,
      "src/lib/request.server.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })

    await expect(run(root, undefined, {
      input: {
        client: join(root, "src/client.ts"),
        health: join(root, "src/routes/api/health.ts"),
      },
    })).resolves.toBeUndefined()
  })

  it("rejects transitive leaks during dev transforms", async () => {
    const root = fixture({
      "src/client.ts": `import { request } from "./index"; console.log(request)`,
      "src/index.ts": `export { request } from "./start"`,
      "src/start.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })
    const server = await createServer({
      root,
      logLevel: "silent",
      plugins: [boundary()],
    })
    servers.push(server)

    await server.transformRequest("/src/client.ts")
    await expect(server.transformRequest("/src/index.ts")).rejects.toThrow("reaches TanStack Start backend boundary")
  })

  it("rethrows cached graph violations during dev reloads", async () => {
    const root = fixture({
      "src/routes/index.tsx": `
        import { request } from "../start"
        export const route = request
      `,
      "src/start.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })
    const server = await createServer({
      root,
      logLevel: "silent",
      plugins: [boundary()],
    })
    servers.push(server)

    await expect(server.transformRequest("/src/routes/index.tsx")).rejects.toThrow("reaches TanStack Start backend boundary")
    await expect(server.transformRequest("/src/routes/index.tsx")).rejects.toThrow("reaches TanStack Start backend boundary")
  })

  it("prunes orphaned records before build graph checks", async () => {
    const root = fixture({
      "src/client.ts": `
        import { request } from "./start"
        console.log(request)
      `,
      "src/start.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })
    const plugin = boundary()

    await expect(runWithPlugin(root, plugin)).rejects.toThrow("reaches TanStack Start backend boundary")

    write(root, "src/client.ts", `console.log("clean")`)

    await expect(runWithPlugin(root, plugin)).resolves.toBeUndefined()
  })

  it("allows server-only helpers to import the runtime adapter when they are not client-reachable", async () => {
    const root = fixture({
      "src/client.ts": `console.log("client")`,
      "src/lib/scope.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })

    await expect(run(root, undefined, {
      input: {
        client: join(root, "src/client.ts"),
        scope: join(root, "src/lib/scope.ts"),
      },
    })).resolves.toBeUndefined()
  })

  it("does not classify excluded node_modules server filenames as app backend boundaries", async () => {
    const root = fixture({
      "src/client.ts": `
        import { value } from "serverish"
        console.log(value)
      `,
      "node_modules/serverish/package.json": JSON.stringify({
        type: "module",
        main: "./dist/index.server.js",
        module: "./dist/index.server.js",
      }),
      "node_modules/serverish/dist/index.server.js": `export const value = "ok"`,
    })

    await expect(run(root)).resolves.toBeUndefined()
  })

  it("does not classify siblings of a local adapter entry as runtime imports", async () => {
    const root = fixture({
      "src/client.ts": `
        import { analytics } from "./shims/analytics"
        console.log(analytics)
      `,
      "src/shims/start.ts": `export const tanstackStart = { contextKey: "lite" }`,
      "src/shims/analytics.ts": `export const analytics = "ok"`,
    })

    await expect(run(root, undefined, {
      alias: {
        "@pumped-fn/lite-tanstack-start": join(root, "src/shims/start.ts"),
      },
    })).resolves.toBeUndefined()
  })

  it("classifies sibling files inside a local adapter package as runtime imports", async () => {
    const root = fixture({
      "src/client.ts": `
        import { tanstackStart } from "start-runtime"
        console.log(tanstackStart)
      `,
      "packages/start/package.json": JSON.stringify({
        type: "module",
        name: "@pumped-fn/lite-tanstack-start",
      }),
      "packages/start/src/index.ts": `export const tanstackStart = { contextKey: "lite" }`,
      "packages/start/runtime/adapter.ts": `export const tanstackStart = { contextKey: "lite" }`,
    })

    await expect(run(root, undefined, {
      alias: {
        "@pumped-fn/lite-tanstack-start": join(root, "packages/start/src/index.ts"),
        "start-runtime": join(root, "packages/start/runtime/adapter.ts"),
      },
    })).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })

  it("retries adapter package resolution after a missing package result", async () => {
    const plugin = boundary()
    const root = fixture({
      "packages/start/package.json": JSON.stringify({
        type: "module",
        name: "@pumped-fn/lite-tanstack-start",
      }),
      "packages/start/index.ts": `export const tanstackStart = { contextKey: "lite" }`,
      "packages/start/runtime.ts": `export const tanstackStart = { contextKey: "lite" }`,
    }, { adapter: false })
    const transform = plugin.transform as Function
    let available = false
    const ctx = {
      parse: parseAst,
      resolve: async (source: string) => {
        if (source === "@pumped-fn/lite-tanstack-start") {
          return available ? { id: join(root, "packages/start/index.ts") } : undefined
        }
        if (source === "start-runtime") return { id: join(root, "packages/start/runtime.ts") }
        return undefined
      },
    }

    await transform.call(ctx, `console.log("clean")`, join(root, "src/client.ts"))
    available = true

    await expect(transform.call(ctx, `
      import { tanstackStart } from "start-runtime"
      console.log(tanstackStart)
    `, join(root, "src/client.ts"))).rejects.toThrow("Runtime import of @pumped-fn/lite-tanstack-start is only allowed")
  })
})

function fixture(files: Record<string, string>, options: { adapter?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pumped-start-boundary-"))
  roots.push(root)
  write(root, "package.json", JSON.stringify({ type: "module" }))
  if (options.adapter !== false) {
    write(root, "node_modules/@pumped-fn/lite-tanstack-start/package.json", JSON.stringify({
      type: "module",
      main: "./index.js",
      module: "./index.js",
    }))
    write(root, "node_modules/@pumped-fn/lite-tanstack-start/index.js", `
      export const tanstackStart = { contextKey: "lite" }
    `)
    write(root, "node_modules/@pumped-fn/lite-tanstack-start/deep.js", `
      export const tanstackStart = { contextKey: "lite" }
    `)
  }
  for (const [path, content] of Object.entries(files)) {
    write(root, path, content)
  }
  return root
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

async function run(
  root: string,
  options?: Parameters<typeof boundary>[0],
  config: {
    alias?: Record<string, string>
    input?: string | Record<string, string>
  } = {}
): Promise<void> {
  await runWithPlugin(root, boundary(options), config)
}

async function runWithPlugin(
  root: string,
  plugin: Plugin,
  config: {
    alias?: Record<string, string>
    input?: string | Record<string, string>
  } = {}
): Promise<void> {
  await build({
    root,
    logLevel: "silent",
    plugins: [plugin],
    resolve: {
      alias: config.alias,
    },
    build: {
      write: false,
      rollupOptions: {
        input: config.input ?? join(root, "src/client.ts"),
      },
    },
  })
}
