import { describe, expect, it } from "vitest"
import { buildConfig } from "../src/build-config"

describe("buildConfig", () => {
  it("builds an ssr config against the virtual entry-server id", () => {
    const config = buildConfig("server")

    expect(config.build.ssr).toBe(true)
    expect(config.build.rollupOptions.input).toBe("virtual:pumped/entry-server")
  })

  it("builds an ssr config against the virtual entry-cli id", () => {
    const config = buildConfig("cli")

    expect(config.build.ssr).toBe(true)
    expect(config.build.rollupOptions.input).toBe("virtual:pumped/entry-cli")
  })
})
