import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { build } from "vite"
import { afterEach, describe, expect, it } from "vitest"
import { graphFileName, pumpedGraph, pumpedVite, type LiteMeta } from "../src"

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

describe("pumpedGraph build metadata", () => {
  it("emits Lite graph metadata without injecting HMR runtime code", async () => {
    const root = fixture()

    await build({
      root,
      logLevel: "silent",
      plugins: [pumpedGraph()],
      resolve: {
        alias: {
          "@pumped-fn/lite": join(root, "lite.js"),
        },
      },
      build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
          input: join(root, "src/main.ts"),
        },
      },
    })

    const meta = JSON.parse(readFileSync(join(root, "dist", graphFileName), "utf8")) as LiteMeta
    const js = files(join(root, "dist")).filter((file) => file.endsWith(".js")).map((file) => readFileSync(file, "utf8")).join("\n")

    expect(meta.handles.map((handle) => [handle.kind, handle.name])).toEqual([
      ["resource", "external"],
      ["atom", "config"],
      ["resource", "tx"],
      ["tag", "requestId"],
      ["flow", "run"],
    ])
    expect(meta.atoms.map((atom) => atom.name)).toEqual(["config"])
    expect(meta.edges.map((edge) => [edge.fromName, edge.slot, edge.toName, edge.via])).toEqual([
      ["run", "config", "config", "direct"],
      ["run", "tx", "tx", "controller"],
      ["run", "external", "external", "controller"],
      ["run", "requestId", "requestId", "tag"],
    ])
    expect(meta.edges.find((edge) => edge.slot === "external")).toEqual(expect.objectContaining({
      importId: "src/external.ts",
      to: "src/external.ts:external",
      toKind: "resource",
    }))
    expect(meta.issues).toEqual([])
    expect(js).not.toContain("__hmr_register")
    expect(js).not.toContain("@pumped-fn/lite-hmr/runtime")
  })

  it("builds apps that import the virtual devtools feed", async () => {
    const root = fixture()

    await build({
      root,
      logLevel: "silent",
      plugins: [pumpedVite({ graph: true })],
      resolve: {
        alias: {
          "@pumped-fn/lite": join(root, "lite.js"),
        },
      },
      build: {
        outDir: "dist",
        emptyOutDir: true,
        rollupOptions: {
          input: join(root, "src/with-feed.ts"),
        },
      },
    })

    expect(readFileSync(join(root, "dist", graphFileName), "utf8")).toContain('"handles"')
  })
})

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "pumped-lite-graph-"))
  roots.push(root)
  write(root, "package.json", JSON.stringify({ type: "module" }))
  write(root, "lite.js", [
    "export function atom(input) { return input }",
    "export function flow(input) { return input }",
    "export function resource(input) { return input }",
    "export function tag(input) { return input }",
    "export function controller(input) { return input }",
    "export const tags = { required: (input) => input }",
  ].join("\n"))
  write(root, "src/external.ts", `import { resource } from "@pumped-fn/lite"
export const external = resource<{ id: string }>({ factory: () => ({ id: "external" }) })
`)
  write(root, "src/main.ts", `import { atom, controller, flow, resource, tag, tags } from "@pumped-fn/lite"
import { external } from "./external"
export const config = atom<{ value: number }>({ factory: () => ({ value: 1 }) })
export const tx = resource<{ id: string }>({ factory: () => ({ id: "tx" }) })
export const requestId = tag<string>({ label: "request.id" })
export const run = flow<{ input: string }, string>({
  deps: {
    config,
    tx: controller(tx),
    external: controller(external),
    requestId: tags.required(requestId),
  },
  factory: () => "ok"
})
console.log(config, run, tx, requestId)
`)
  write(root, "src/with-feed.ts", `import { handles } from "virtual:pumped-fn/lite-hmr"
import { atom } from "@pumped-fn/lite"
export const config = atom({ factory: () => handles.length })
console.log(config)
`)
  return root
}

function write(root: string, path: string, content: string): void {
  const file = join(root, path)
  mkdirSync(file.slice(0, file.lastIndexOf("/")), { recursive: true })
  writeFileSync(file, content)
}

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? files(path) : [path]
  })
}
