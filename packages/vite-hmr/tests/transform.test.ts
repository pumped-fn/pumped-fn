import { describe, it, expect } from "vitest"
import { transformAtoms } from "../src/transform"

describe("transformAtoms", () => {
  it("transforms const atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const configAtom = atom({ factory: () => ({}) })`
    const filePath = "src/atoms.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("import { __hmr_register }")
    expect(result!.code).toContain("__hmr_register('src/atoms.ts:")
    expect(result!.code).toContain(", atom({ factory:")
  })

  it("transforms export const atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
export const dbAtom = atom({ factory: async () => createDb() })`
    const filePath = "src/db.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register('src/db.ts:")
  })

  it("transforms let atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
let mutableAtom = atom({ factory: () => 0 })`
    const filePath = "src/state.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register('src/state.ts:")
  })

  it("does NOT transform dynamic atom creation", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const atoms = [atom({ factory: () => 1 })]`
    const filePath = "src/dynamic.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("does NOT transform atom in function call", () => {
    const code = `import { atom } from '@pumped-fn/lite'
registerAtom(atom({ factory: () => 1 }))`
    const filePath = "src/register.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("returns null when no atom() calls present", () => {
    const code = `const x = 1`
    const filePath = "src/noatom.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("uses line:column for unique keys", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const a = atom({ factory: () => 1 })
const b = atom({ factory: () => 2 })`
    const filePath = "src/multi.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toMatch(/__hmr_register\('src\/multi\.ts:2:\d+'/)
    expect(result!.code).toMatch(/__hmr_register\('src\/multi\.ts:3:\d+'/)
  })

  it("generates sourcemap", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const configAtom = atom({ factory: () => ({}) })`
    const filePath = "src/atoms.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.map).toBeDefined()
  })
})
