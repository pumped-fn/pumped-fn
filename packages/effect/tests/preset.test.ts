import { describe, it, expect } from "vitest"
import { atom } from "../src/atom"
import { preset, isPreset } from "../src/preset"

describe("Preset", () => {
  it("creates preset with static value", () => {
    const configAtom = atom({ factory: () => ({ port: 3000 }) })
    const p = preset(configAtom, { port: 8080 })

    expect(isPreset(p)).toBe(true)
    expect(p.atom).toBe(configAtom)
    expect(p.value).toEqual({ port: 8080 })
  })

  it("creates preset with another atom", () => {
    const configAtom = atom({ factory: () => ({ port: 3000 }) })
    const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })
    const p = preset(configAtom, testConfigAtom)

    expect(p.atom).toBe(configAtom)
    expect(p.value).toBe(testConfigAtom)
  })
})
