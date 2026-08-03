import { describe, expect, it } from "vitest"
import type { EntryDescriptor, EntryKind } from "../src/discover"
import { buildConfig, selectTargetEntries } from "../src/build-config"

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
