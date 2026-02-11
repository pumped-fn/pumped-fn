import { describe, it, expect } from "vitest"
import { atom } from "../src/atom"
import { flow, typed } from "../src/flow"
import { preset, isPreset } from "../src/preset"
import { createScope } from "../src/scope"
import type { Lite } from "../src/types"

describe("Preset", () => {
  it("creates preset with static value or atom reference", () => {
    const configAtom = atom({ factory: () => ({ port: 3000 }) })
    const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })

    const staticPreset = preset(configAtom, { port: 8080 })
    expect(isPreset(staticPreset)).toBe(true)
    expect(staticPreset.target).toBe(configAtom)
    expect(staticPreset.value).toEqual({ port: 8080 })

    const atomPreset = preset(configAtom, testConfigAtom)
    expect(atomPreset.target).toBe(configAtom)
    expect(atomPreset.value).toBe(testConfigAtom)
  })

  it("throws when preset references itself", () => {
    const myAtom = atom({ factory: () => "value" })
    expect(() => preset(myAtom, myAtom)).toThrow("preset cannot reference itself")

    const myFlow = flow({ factory: () => "result" })
    expect(() => preset(myFlow, myFlow)).toThrow("preset cannot reference itself")
  })

  it("throws when target is neither Atom nor Flow", () => {
    expect(() => preset({} as any, "value")).toThrow("preset target must be Atom or Flow")
  })

  describe("Flow presets", () => {
    it("flow preset with function bypasses deps", async () => {
      const depAtom = atom({
        factory: () => {
          throw new Error("deps should not be resolved")
        },
      })

      const originalFlow = flow({
        parse: typed<string>(),
        deps: { dep: depAtom },
        factory: (_ctx, { dep }) => `got: ${dep}`,
      })

      const scope = createScope({
        presets: [preset(originalFlow, (ctx) => `mocked: ${ctx.input}`)],
      })

      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: originalFlow, input: "test" })
      expect(result).toBe("mocked: test")
    })

    it("flow preset function receives parsed input", async () => {
      const originalFlow = flow({
        parse: (raw: unknown) => ({ parsed: String(raw).toUpperCase() }),
        factory: (ctx) => ctx.input,
      })

      const scope = createScope({
        presets: [preset(originalFlow, (ctx) => ctx.input)],
      })

      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: originalFlow, rawInput: "hello" })
      expect(result).toEqual({ parsed: "HELLO" })
    })

    it("flow→flow delegates parse/deps entirely", async () => {
      const originalFlow = flow({
        parse: (raw: unknown): number => {
          throw new Error("original parse should not run")
        },
        factory: (): string => {
          throw new Error("original factory should not run")
        },
      })

      const replacementFlow = flow({
        parse: (raw: unknown) => Number(raw) * 2,
        factory: (ctx) => `result: ${ctx.input}`,
      })

      const scope = createScope({
        presets: [preset(originalFlow, replacementFlow)],
      })

      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: originalFlow, rawInput: "5" })
      expect(result).toBe("result: 10")
    })

    it("extensions wrap flow preset function", async () => {
      let wrapCount = 0
      const testExtension: Lite.Extension = {
        name: "test",
        wrapExec: async (next) => {
          wrapCount++
          return next()
        },
      }

      const originalFlow = flow({ factory: () => "original" })

      const scope = createScope({
        extensions: [testExtension],
        presets: [preset(originalFlow, () => "mocked")],
      })

      const ctx = scope.createContext()
      await ctx.exec({ flow: originalFlow })
      expect(wrapCount).toBe(1)
    })

    it("extensions wrap flow→flow delegation", async () => {
      let wrapCount = 0
      const testExtension: Lite.Extension = {
        name: "test",
        wrapExec: async (next) => {
          wrapCount++
          return next()
        },
      }

      const originalFlow = flow({ factory: () => "original" })
      const replacementFlow = flow({ factory: () => "replacement" })

      const scope = createScope({
        extensions: [testExtension],
        presets: [preset(originalFlow, replacementFlow)],
      })

      const ctx = scope.createContext()
      await ctx.exec({ flow: originalFlow })
      expect(wrapCount).toBe(1)
    })
  })
})
