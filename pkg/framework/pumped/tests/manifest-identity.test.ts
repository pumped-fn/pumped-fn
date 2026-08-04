import { fileURLToPath } from "node:url"
import { build, type Plugin } from "vite"
import { describe, expect, it } from "vitest"
import { buildConfig, manifestConfig } from "../src/build-config"
import { manifestId, pumped } from "../src/plugin"

const fixtureRoot = fileURLToPath(new URL("fixtures/basic", import.meta.url))
const probeFile = fileURLToPath(new URL("fixtures/basic/src/server/book-space.ts", import.meta.url))

function probe(): Plugin {
  return {
    name: "manifest-hash-probe",
    enforce: "pre",
    transform: (code, id) => id === probeFile ? `${code}\nexport const probe = "changed"\n` : undefined,
  }
}

async function bundle(config: { build: object }, plugins: Plugin[] = []): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    root: fixtureRoot,
    plugins: [...plugins, ...pumped({ dir: "src" })],
    ...config,
    build: { ...config.build, write: false, minify: false, target: "es2022" },
  })
  const outputs = (Array.isArray(result) ? result : [result])
    .flatMap((item) => "output" in item ? item.output : [])
  return outputs.filter((chunk) => chunk.type === "chunk").map((chunk) => chunk.code).join("\n")
}

function graphConfig(target: "server" | "cli") {
  return manifestConfig(manifestId(target), "dist")
}

function hashOf(code: string): string | undefined {
  return (code.match(/sha256:[a-f0-9]{64}/g) ?? [])[0]
}

describe("shipped manifest identity", () => {
  it("substitutes exactly one content hash and leaks no checkout path", async () => {
    const code = await bundle(graphConfig("server"))

    expect(code.match(/sha256:[a-f0-9]{64}/g)).toHaveLength(1)
    expect(code).toMatch(/"app":\s*"default"/)
    expect(code).toMatch(/"target":\s*"server"/)
    expect(code).not.toContain(fixtureRoot)
  })

  it("embeds the same hash whether built for graph inspection or for production", async () => {
    const [graph, production] = await Promise.all([
      bundle(graphConfig("server")),
      bundle(buildConfig("server")),
    ])

    expect(hashOf(graph)).toBe(hashOf(production))
  })

  it("changes the content hash when a module in the manifest closure changes", async () => {
    const [base, changed] = await Promise.all([
      bundle(graphConfig("server")),
      bundle(graphConfig("server"), [probe()]),
    ])

    expect(hashOf(changed)).not.toBe(hashOf(base))
  })

  it("gives the server and cli targets distinct hashes", async () => {
    const [server, cli] = await Promise.all([
      bundle(graphConfig("server")),
      bundle(graphConfig("cli")),
    ])

    expect(hashOf(server)).not.toBe(hashOf(cli))
  })
})
