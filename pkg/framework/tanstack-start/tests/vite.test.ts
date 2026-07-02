import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { build } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { boundary, tanstackStartBoundary } from "../src/vite"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("TanStack Start boundary Vite plugin", () => {
  it("exposes stable plugin factories", () => {
    expect(boundary().name).toBe("pumped-fn-tanstack-start-boundary")
    expect(tanstackStartBoundary().name).toBe("pumped-fn-tanstack-start-boundary")
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

  it("can treat route modules as client-reachable when the app wants strict route loader boundaries", async () => {
    const root = fixture({
      "src/client.ts": `import "./routes/index"`,
      "src/routes/index.tsx": `
        import { request } from "../start"
        export const route = request
      `,
      "src/start.ts": `
        import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
        export const request = tanstackStart.contextKey
      `,
    })

    await expect(run(root, { client: [/\/src\/client\.[cm]?[jt]sx?$/, /\/src\/routes\//] })).rejects.toThrow(
      "reaches TanStack Start backend boundary"
    )
  })
})

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pumped-start-boundary-"))
  roots.push(root)
  write(root, "package.json", JSON.stringify({ type: "module" }))
  write(root, "node_modules/@pumped-fn/lite-tanstack-start/package.json", JSON.stringify({
    type: "module",
    main: "./index.js",
    module: "./index.js",
  }))
  write(root, "node_modules/@pumped-fn/lite-tanstack-start/index.js", `
    export const tanstackStart = { contextKey: "lite" }
  `)
  for (const [path, content] of Object.entries(files)) {
    write(root, path, content)
  }
  return root
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), content)
}

async function run(root: string, options?: Parameters<typeof boundary>[0]): Promise<void> {
  await build({
    root,
    logLevel: "silent",
    plugins: [boundary(options)],
    build: {
      write: false,
      rollupOptions: {
        input: join(root, "src/client.ts"),
      },
    },
  })
}
