import type { UserConfig } from "vite"
import { describe, expect, it } from "vitest"
import { pumped } from "../src/plugin"

function appPluginConfig(userConfig: UserConfig = {}) {
  const [appPlugin] = pumped()
  const config = appPlugin?.config
  if (typeof config !== "function") throw new Error("expected a config hook function")
  return config.call({} as never, userConfig, { command: "serve", mode: "development" })
}

describe("pumped plugin config", () => {
  it("defaults to a custom app type so vite's own 404 never answers a discovered GET route", () => {
    expect(appPluginConfig()).toMatchObject({ appType: "custom" })
  })

  it("keeps an app type the application chose for itself", () => {
    expect(appPluginConfig({ appType: "spa" })).toMatchObject({ appType: "spa" })
  })

  it("externalizes the runtime entry alongside the package index", () => {
    expect(appPluginConfig()).toMatchObject({
      ssr: { external: expect.arrayContaining(["@pumped-fn/pumped", "@pumped-fn/pumped/runtime"]) },
    })
  })
})
