import { describe, it, expect, afterEach } from "vitest"
import { pumpedHmr } from "../src/plugin"

describe("pumpedHmr plugin", () => {
  const originalEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalEnv
  })

  it("has correct plugin name", () => {
    const plugin = pumpedHmr()
    expect(plugin.name).toBe("pumped-fn-hmr")
  })

  it("enforces pre transform order", () => {
    const plugin = pumpedHmr()
    expect(plugin.enforce).toBe("pre")
  })

  it("skips transform in production", () => {
    process.env.NODE_ENV = "production"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(
      `const x = atom({ factory: () => 1 })`,
      "src/atoms.ts"
    )

    expect(result).toBeNull()
  })

  it("skips non-JS/TS files", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    expect(transform("const x = 1", "src/styles.css")).toBeNull()
    expect(transform("const x = 1", "src/data.json")).toBeNull()
  })

  it("skips node_modules", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(
      `const x = atom({ factory: () => 1 })`,
      "node_modules/@pumped-fn/lite/index.js"
    )

    expect(result).toBeNull()
  })

  it("skips files without atom() calls", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(`const x = 1`, "src/utils.ts")

    expect(result).toBeNull()
  })

  it("transforms files with atom() calls", () => {
    process.env.NODE_ENV = "development"
    const plugin = pumpedHmr()
    const transform = plugin.transform as Function

    const result = transform(
      `import { atom } from '@pumped-fn/lite'
const configAtom = atom({ factory: () => ({}) })`,
      "src/atoms.ts"
    )

    expect(result).not.toBeNull()
    expect(result.code).toContain("__hmr_register")
  })
})
