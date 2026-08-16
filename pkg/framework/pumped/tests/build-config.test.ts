import { flow } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { buildConfig, manifestConfig, planTarget } from "../src/build-config"
import { entry } from "../src/entry"
import type { Manifest, ManifestEntry } from "../src/runtime/manifest"
import { command, route, schedule, workflow } from "../src/tags"

const noop = flow({ factory: () => undefined })

function planEntry(name: string, tags: Parameters<typeof entry>[0]["tags"]): ManifestEntry {
  return { name, file: `src/entries/${name}.ts`, entry: entry({ flow: noop, tags }) }
}

const planned: Manifest = {
  app: undefined,
  entries: [
    planEntry("web-only", [route({ method: "GET", path: "/web" })]),
    planEntry("cli-only", [command({ name: "cli-only" })]),
    planEntry("sweep", [schedule({ cron: "0 2 * * *" })]),
    planEntry("warm", [workflow({})]),
    planEntry("dual", [route({ method: "POST", path: "/dual" }), command({ name: "dual" })]),
  ],
}

describe("planTarget", () => {
  it("selects server entries and hosts from tags", () => {
    expect(planTarget(planned, "server")).toEqual({
      files: ["src/entries/web-only.ts", "src/entries/sweep.ts", "src/entries/warm.ts", "src/entries/dual.ts"],
      hosts: ["http", "cron", "workflow"],
    })
  })

  it("selects cli entries and hosts from tags", () => {
    expect(planTarget(planned, "cli")).toEqual({
      files: ["src/entries/cli-only.ts", "src/entries/dual.ts"],
      hosts: ["cli"],
    })
  })

  it("omits hosts no entry needs", () => {
    const webOnly: Manifest = { app: undefined, entries: [planEntry("web", [route({ method: "GET", path: "/w" })])] }

    expect(planTarget(webOnly, "server")).toEqual({ files: ["src/entries/web.ts"], hosts: ["http"] })
  })
})

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

  it("leaves SSR externalization to the plugin on both the production and manifest paths", () => {
    expect(buildConfig("server")).not.toHaveProperty("ssr")
    expect(manifestConfig("virtual:pumped/manifest/app", "dist")).not.toHaveProperty("ssr")
  })
})
