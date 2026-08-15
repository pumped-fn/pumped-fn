import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { build, type Plugin } from "vite"
import { describe, expect, it } from "vitest"
import { buildConfig, manifestConfig, type TargetPlan } from "../src/build-config"
import { manifestId, pumped } from "../src/plugin"

const fixtureRoot = fileURLToPath(new URL("fixtures/basic", import.meta.url))
const probeFile = fileURLToPath(new URL("fixtures/basic/src/entries/book-space.ts", import.meta.url))
const srcIndex = resolve(fileURLToPath(new URL("..", import.meta.url)), "src/index.ts")

const serverPlan: TargetPlan & { target: "server" } = {
  target: "server",
  files: ["src/entries/book-space.ts", "src/entries/list-lots.ts", "src/entries/nightly-sweep.ts"],
  hosts: ["http", "cron"],
}

function probe(): Plugin {
  return {
    name: "manifest-hash-probe",
    enforce: "pre",
    transform: (code, id) => id === probeFile ? `${code}\nexport const probe = "changed"\n` : undefined,
  }
}

async function bundle(
  config: { build: object },
  plugins: Plugin[] = [],
  options: Parameters<typeof pumped>[0] = {}
): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: fixtureRoot,
    resolve: { alias: { "@pumped-fn/pumped": srcIndex } },
    plugins: [...plugins, ...pumped({ dir: "src", ...options })],
    ...config,
    build: { ...config.build, write: false, minify: false, target: "es2022" },
  })
  const outputs = (Array.isArray(result) ? result : [result])
    .flatMap((item) => "output" in item ? item.output : [])
  return outputs.filter((chunk) => chunk.type === "chunk").map((chunk) => chunk.code).join("\n")
}

function graphConfig(target: "app" | "server" | "cli") {
  return manifestConfig(manifestId(target), "dist")
}

function hashOf(code: string): string | undefined {
  return (code.match(/sha256:[a-f0-9]{64}/g) ?? [])[0]
}

describe("shipped manifest identity", () => {
  it("substitutes exactly one content hash and leaks no checkout path", async () => {
    const code = await bundle(graphConfig("app"))

    expect(code.match(/sha256:[a-f0-9]{64}/g)).toHaveLength(1)
    expect(code).toMatch(/"app":\s*"default"/)
    expect(code).toMatch(/"target":\s*"app"/)
    expect(code).not.toContain(fixtureRoot)
  })

  it("embeds the same hash whether a target manifest is built alone or into the production entry", async () => {
    const [alone, production] = await Promise.all([
      bundle(graphConfig("server"), [], { plan: serverPlan }),
      bundle(buildConfig("server"), [], { plan: serverPlan }),
    ])

    expect(hashOf(alone)).toBeDefined()
    expect(hashOf(alone)).toBe(hashOf(production))
  })

  it("changes the content hash when a module in the manifest closure changes", async () => {
    const [base, changed] = await Promise.all([
      bundle(graphConfig("app")),
      bundle(graphConfig("app"), [probe()]),
    ])

    expect(hashOf(changed)).not.toBe(hashOf(base))
  })

  it("gives the census and the filtered targets distinct hashes", async () => {
    const [census, server, cli] = await Promise.all([
      bundle(graphConfig("app")),
      bundle(graphConfig("server"), [], { plan: serverPlan }),
      bundle(graphConfig("cli"), [], { plan: { target: "cli", files: ["src/entries/report.ts"], hosts: ["cli"] } }),
    ])

    expect(new Set([hashOf(census), hashOf(server), hashOf(cli)]).size).toBe(3)
  })
})
