import { describe, expect, it } from "vitest"
import type { EntryDescriptor, EntryKind } from "../src/discover"
import { buildConfig, manifestConfig, selectTargetEntries } from "../src/build-config"

const kinds: EntryKind[] = ["server", "cli", "jobs", "agents", "workflows"]
const entries: EntryDescriptor[] = kinds.map((kind) => ({ kind, name: kind, file: `/src/${kind}/entry.ts` }))

describe("buildConfig", () => {
  it("builds an SSR config against the virtual server entry", () => {
    const config = buildConfig("server")

    expect(config.build.ssr).toBe(true)
    expect(config.build.rollupOptions.input).toBe("virtual:pumped/entry-server")
  })

  it("builds an SSR config against the virtual CLI entry", () => {
    const config = buildConfig("cli")

    expect(config.build.ssr).toBe(true)
    expect(config.build.rollupOptions.input).toBe("virtual:pumped/entry-cli")
  })

  it("isolates named app artifacts from the default app", () => {
    expect(buildConfig("server").build.outDir).toBe("dist")
    expect(buildConfig("server", "default").build.outDir).toBe("dist")
    expect(buildConfig("server", "east").build.outDir).toBe("dist/apps/east")
    expect(buildConfig("cli", "east/preview").build.outDir).toBe("dist/apps/east%2Fpreview")
  })

  it("leaves SSR externalization to the project on both the production and manifest paths", () => {
    expect(buildConfig("server")).not.toHaveProperty("ssr")
    expect(manifestConfig("virtual:pumped/manifest/server", "dist")).not.toHaveProperty("ssr")
  })
})

describe("selectTargetEntries", () => {
  it("selects only server runtime roots", () => {
    expect(selectTargetEntries(entries, "server").map((entry) => entry.kind)).toEqual([
      "server",
      "jobs",
      "agents",
      "workflows",
    ])
  })

  it("selects only CLI runtime roots", () => {
    expect(selectTargetEntries(entries, "cli").map((entry) => entry.kind)).toEqual(["cli", "agents"])
  })
})
