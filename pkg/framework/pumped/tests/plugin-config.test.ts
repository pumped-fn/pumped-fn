import type { UserConfig } from "vite"
import { describe, expect, it, vi } from "vitest"
import { pumped, type PumpedOptions } from "../src/plugin"

function appPluginConfig(
  userConfig: UserConfig = {},
  env: { command: "serve" | "build"; mode: string } = { command: "serve", mode: "development" },
  options: PumpedOptions = {},
  warn = vi.fn()
) {
  const [appPlugin] = pumped(options)
  const config = appPlugin?.config
  if (typeof config !== "function") throw new Error("expected a config hook function")
  return config.call({ warn } as never, userConfig, env)
}

describe("pumped plugin config", () => {
  it("defaults to a custom app type so vite's own 404 never answers a discovered GET route", () => {
    expect(appPluginConfig()).toMatchObject({ appType: "custom" })
  })

  it.each(["spa", "mpa"] as const)("overrides an explicit %s app type and warns why", (appType) => {
    const warn = vi.fn()

    expect(appPluginConfig({ appType }, { command: "serve", mode: "development" }, {}, warn)).toMatchObject({
      appType: "custom",
    })
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `pumped overrides Vite appType "${appType}" with "custom" because pumped owns the request pipeline`
    )
  })

  it("externalizes pumped, lite, and the scheduler in dev so module identity crosses the runner boundary", () => {
    expect(appPluginConfig()).toMatchObject({
      ssr: {
        external: expect.arrayContaining([
          "@pumped-fn/pumped",
          "@pumped-fn/lite",
          "@pumped-fn/lite-extension-scheduler",
        ]),
      },
    })
  })

  it("bundles pumped and externalizes exactly the peers in a planned target build", () => {
    const config = appPluginConfig(
      {},
      { command: "build", mode: "production" },
      { plan: { target: "server", files: [], hosts: ["http"] } }
    )

    expect(config).toMatchObject({
      ssr: {
        external: ["@pumped-fn/lite", "hono", "@hono/node-server", "@pumped-fn/lite-extension-scheduler"],
      },
    })
    expect(String((config as { ssr: { noExternal: unknown[] } }).ssr.noExternal[0])).toContain("@pumped-fn\\/pumped")
  })

  it("keeps the census build external like dev so tag identity holds when the bin evaluates specs", () => {
    expect(appPluginConfig({}, { command: "build", mode: "production" })).toMatchObject({
      ssr: { external: expect.arrayContaining(["@pumped-fn/pumped"]) },
    })
  })
})
