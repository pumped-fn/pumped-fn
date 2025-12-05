import { describe, it, expect } from "vitest"
import { atom } from "../src/atom"
import { preset, isPreset } from "../src/preset"

describe("Preset", () => {
  it("creates preset with static value or atom reference", () => {
    const configAtom = atom({ factory: () => ({ port: 3000 }) })
    const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })

    const staticPreset = preset(configAtom, { port: 8080 })
    expect(isPreset(staticPreset)).toBe(true)
    expect(staticPreset.atom).toBe(configAtom)
    expect(staticPreset.value).toEqual({ port: 8080 })

    const atomPreset = preset(configAtom, testConfigAtom)
    expect(atomPreset.atom).toBe(configAtom)
    expect(atomPreset.value).toBe(testConfigAtom)
  })
})
