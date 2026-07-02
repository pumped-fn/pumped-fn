import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createServer, type ViteDevServer } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { hmrInspectPath, hmrMetaPath, pumpedHmr, type HmrMeta } from "../src"

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

describe("pumpedHmr dev server feed", () => {
  it("serves transformed Lite handle metadata over Vite dev middleware", async () => {
    const root = fixture()
    const server = await createServer({
      root,
      logLevel: "silent",
      plugins: [pumpedHmr()],
      resolve: {
        alias: {
          "@pumped-fn/lite-hmr/runtime": new URL("../src/runtime.ts", import.meta.url).pathname,
          "@pumped-fn/lite": join(root, "lite.js"),
        },
      },
      server: {
        port: 0,
      },
    })
    servers.push(server)
    await server.listen()
    const origin = server.resolvedUrls?.local[0]
    expect(origin).toBeDefined()

    await fetch(new URL("/src/main.ts", origin))
    await fetch(new URL("/src/external.ts", origin))
    const meta = await fetch(new URL(hmrMetaPath, origin)).then((res) => res.json() as Promise<HmrMeta>)
    const html = await fetch(new URL(hmrInspectPath, origin)).then((res) => res.text())

    expect(meta.handles.map((handle) => [handle.kind, handle.name])).toEqual([
      ["resource", "external"],
      ["atom", "config"],
      ["flow", "run"],
    ])
    expect(meta.atoms.map((atom) => atom.name)).toEqual(["config"])
    expect(meta.edges.map((edge) => [edge.fromName, edge.slot, edge.toName])).toEqual([
      ["run", "config", "config"],
      ["run", "external", "external"],
    ])
    expect(meta.edges.find((edge) => edge.slot === "external")).toEqual(expect.objectContaining({
      importId: "src/external.ts",
      to: "src/external.ts:external",
      toKind: "resource",
    }))
    expect(meta.issues).toEqual([])
    expect(html).toContain("Pumped Lite HMR")
    expect(html).toContain(`fetch("${hmrMetaPath}")`)
    expect(html).toContain("<h2>Deps</h2>")
    expect(html).toContain("<h2>Issues</h2>")
  })

  it("serves metadata endpoints under Vite base", async () => {
    const root = fixture()
    const server = await createServer({
      root,
      base: "/app/",
      logLevel: "silent",
      plugins: [pumpedHmr()],
      resolve: {
        alias: {
          "@pumped-fn/lite-hmr/runtime": new URL("../src/runtime.ts", import.meta.url).pathname,
          "@pumped-fn/lite": join(root, "lite.js"),
        },
      },
      server: {
        port: 0,
      },
    })
    servers.push(server)
    await server.listen()
    const origin = server.resolvedUrls?.local[0]
    expect(origin).toBeDefined()

    await fetch(new URL("/app/src/main.ts", origin))
    const meta = await fetch(new URL("/app/__pumped-fn/lite-hmr.json", origin))
    const html = await fetch(new URL("/app/__pumped-fn/lite-hmr", origin)).then((res) => res.text())

    expect(meta.status).toBe(200)
    expect(meta.headers.get("content-type")).toContain("application/json")
    expect(html).toContain(`fetch("/app${hmrMetaPath}")`)
  })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "pumped-lite-hmr-"))
  roots.push(root)
  write(root, "package.json", JSON.stringify({ type: "module" }))
  write(root, "lite.js", [
    "export function atom(input) { return input }",
    "export function flow(input) { return input }",
    "export function resource(input) { return input }",
  ].join("\n"))
  write(root, "src/external.ts", `import { resource } from "@pumped-fn/lite"
export const external = resource({ factory: () => ({}) })
`)
  write(root, "src/main.ts", `import { atom, flow } from "@pumped-fn/lite"
import { external } from "./external"
export const config = atom({ factory: () => ({}) })
export const run = flow({ deps: { config, external }, factory: () => "ok" })
`)
  return root
}

function write(root: string, path: string, content: string): void {
  const file = join(root, path)
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true })
  writeFileSync(file, content)
}
