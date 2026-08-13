import type { UserConfig } from "vite"
import { describe, expect, it, vi } from "vitest"
import { pumped } from "../src/plugin"

function appPluginConfig(userConfig: UserConfig = {}, warn = vi.fn()) {
  const [appPlugin] = pumped()
  const config = appPlugin?.config
  if (typeof config !== "function") throw new Error("expected a config hook function")
  return config.call({ warn } as never, userConfig, { command: "serve", mode: "development" })
}

describe("pumped plugin config", () => {
  it("defaults to a custom app type so vite's own 404 never answers a discovered GET route", () => {
    expect(appPluginConfig()).toMatchObject({ appType: "custom" })
  })

  it.each(["spa", "mpa"] as const)("overrides an explicit %s app type and warns why", (appType) => {
    const warn = vi.fn()

    expect(appPluginConfig({ appType }, warn)).toMatchObject({ appType: "custom" })
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `pumped overrides Vite appType "${appType}" with "custom" because pumped owns the request pipeline`
    )
  })

  it("externalizes the runtime entry alongside the package index", () => {
    expect(appPluginConfig()).toMatchObject({
      ssr: { external: expect.arrayContaining(["@pumped-fn/pumped", "@pumped-fn/pumped/runtime"]) },
    })
  })
})
