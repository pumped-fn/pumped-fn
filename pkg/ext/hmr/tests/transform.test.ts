import { describe, it, expect } from "vitest"
import { transformAtoms } from "../src/transform"

describe("transformAtoms", () => {
  it("transforms const atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const config = atom<{ value: number }>({ factory: () => ({ value: 1 }) })`
    const filePath = "src/atoms.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("import { __hmr_register }")
    expect(result!.code).toContain("__hmr_register(\"src/atoms.ts:")
    expect(result!.code).toContain(", atom<{ value: number }>({ factory:")
    expect(result!.meta.atoms).toEqual([
      expect.objectContaining({
        name: "config",
        kind: "atom",
        file: "src/atoms.ts",
        line: 2,
      }),
    ])
  })

  it("transforms aliased atom imports", () => {
    const code = `import { atom as scoped } from '@pumped-fn/lite'
const config = scoped({ factory: () => ({}) })`
    const filePath = "src/atoms.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register(\"src/atoms.ts:")
    expect(result!.meta.atoms).toEqual([
      expect.objectContaining({
        kind: "atom",
        name: "config",
      }),
    ])
  })

  it("transforms namespace Lite imports", () => {
    const code = `import * as Lite from '@pumped-fn/lite'
import { external } from './external'
const config = Lite.atom({ factory: () => ({}) })
const tenant = Lite.tag<string>({ label: "tenant" })
const run = Lite.flow({
  deps: {
    config,
    db: Lite.controller(external),
    tenant: Lite.tags.required(tenant),
  },
  factory: () => "ok"
})`
    const filePath = "src/namespace.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register(\"src/namespace.ts:config\"")
    expect(result!.meta.handles.map((handle) => [handle.kind, handle.name])).toEqual([
      ["atom", "config"],
      ["tag", "tenant"],
      ["flow", "run"],
    ])
    expect(result!.meta.edges.map((edge) => [edge.slot, edge.toName, edge.via])).toEqual([
      ["config", "config", "direct"],
      ["db", "external", "controller"],
      ["tenant", "tenant", "tag"],
    ])
  })

  it("does NOT transform local functions named atom", () => {
    const code = `function atom<T>(input: T): T {
  return input
}
const local = atom({ factory: () => ({}) })`
    const filePath = "src/local.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("does NOT transform nested shadowed atom declarations", () => {
    const code = `import { atom } from '@pumped-fn/lite'
function make(atom) {
  const local = atom({ factory: () => ({}) })
  return local
}`
    const filePath = "src/local.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("does NOT transform type-only Lite imports", () => {
    const code = `import type { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`
    const filePath = "src/type-only.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("normalizes Vite query suffixes out of metadata keys", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`
    const filePath = "src/atoms.ts?t=123"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.meta.id).toBe("src/atoms.ts")
    expect(result!.meta.atoms[0]?.key).toBe("src/atoms.ts:config")
    expect(result!.meta.atoms[0]?.file).toBe("src/atoms.ts")
  })

  it("records Lite graph handles without wrapping non-atoms", () => {
    const code = `import { flow, resource, tag } from '@pumped-fn/lite'
const run = flow<{ input: string }, string>({ factory: () => "ok" })
const tx = resource<{ id: string }>({ factory: () => ({ id: "tx" }) })
const requestId = tag<string>({ label: "request.id" })`
    const filePath = "src/graph.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain("__hmr_register")
    expect(result!.meta.handles.map((handle) => [handle.kind, handle.name])).toEqual([
      ["flow", "run"],
      ["resource", "tx"],
      ["tag", "requestId"],
    ])
    expect(result!.meta.atoms).toEqual([])
  })

  it("records static Lite dependency edges", () => {
    const code = `import { atom, flow, controller, tag, tags } from '@pumped-fn/lite'
import { external } from './external'
const config = atom({ factory: () => ({}) })
const tenant = tag<string>({ label: "tenant" })
const run = flow({
  deps: {
    config,
    db: controller(external),
    tenant: tags.required(tenant),
  },
  factory: () => "ok"
})`
    const filePath = "src/graph.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.meta.edges.map((edge) => ({
      from: edge.fromName,
      slot: edge.slot,
      to: edge.to,
      toName: edge.toName,
      via: edge.via,
      importSource: edge.importSource,
      toKind: edge.toKind,
    }))).toEqual([
      {
        from: "run",
        slot: "config",
        to: "src/graph.ts:config",
        toName: "config",
        via: "direct",
        importSource: undefined,
        toKind: "atom",
      },
      {
        from: "run",
        slot: "db",
        to: "./external:external",
        toName: "external",
        via: "controller",
        importSource: "./external",
        toKind: undefined,
      },
      {
        from: "run",
        slot: "tenant",
        to: "src/graph.ts:tenant",
        toName: "tenant",
        via: "tag",
        importSource: undefined,
        toKind: "tag",
      },
    ])
  })

  it("reports dynamic dependency expressions", () => {
    const code = `import { atom, flow } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })
const run = flow({
  deps: { config: make(config) },
  factory: () => "ok"
})`
    const filePath = "src/graph.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.meta.edges).toEqual([])
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "dynamic-dep",
        fromName: "run",
        slot: "config",
        target: "make(config)",
        file: "src/graph.ts",
      }),
    ])
  })

  it("reports shorthand default dependency expressions", () => {
    const code = `import { flow } from '@pumped-fn/lite'
const run = flow({
  deps: { config = fallback },
  factory: () => "ok"
})`
    const filePath = "src/graph.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.meta.edges).toEqual([])
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "dynamic-dep",
        fromName: "run",
        slot: "config",
        target: "config = fallback",
      }),
    ])
  })

  it("reports spread dependency expressions", () => {
    const code = `import { flow } from '@pumped-fn/lite'
const rest = makeDeps()
const run = flow({
  deps: { ...rest },
  factory: () => "ok"
})`
    const filePath = "src/graph.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.meta.edges).toEqual([])
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "dynamic-dep",
        fromName: "run",
        slot: "...",
        target: "rest",
      }),
    ])
  })

  it("scopes and reports unknown dependency edge targets", () => {
    const code = `import { flow } from '@pumped-fn/lite'
import external from './external'
const local = makeLocal()
const run = flow({
  deps: { external, local },
  factory: () => "ok"
})`
    const filePath = "src/graph.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.meta.edges.map((edge) => [edge.to, edge.toName, edge.importSource])).toEqual([
      ["./external:default", "default", "./external"],
      ["src/graph.ts:local", "local", undefined],
    ])
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "unknown-dep",
        fromName: "run",
        slot: "local",
        target: "local",
        file: "src/graph.ts",
      }),
    ])
  })

  it("transforms export const atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
export const db = atom({ factory: async () => createDb() })`
    const filePath = "src/db.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register(\"src/db.ts:")
  })

  it("transforms let atom declaration", () => {
    const code = `import { atom } from '@pumped-fn/lite'
let mutable = atom({ factory: () => 0 })`
    const filePath = "src/state.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register(\"src/state.ts:")
  })

  it("does NOT transform dynamic atom creation", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const atoms = [atom({ factory: () => 1 })]`
    const filePath = "src/dynamic.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain("__hmr_register")
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "untracked-atom",
        fromName: "atoms",
        slot: "atom",
        target: "atom({ factory: () => 1 })",
      }),
    ])
  })

  it("does NOT transform atom in function call", () => {
    const code = `import { atom } from '@pumped-fn/lite'
registerAtom(atom({ factory: () => 1 }))`
    const filePath = "src/register.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain("__hmr_register")
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "untracked-atom",
        fromName: "(module)",
        target: "atom({ factory: () => 1 })",
      }),
    ])
  })

  it("reports atom calls imported through barrels without wrapping them", () => {
    const code = `import { atom as define } from '../lib/lite'
const config = define({ factory: () => ({}) })`
    const filePath = "src/barrel.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain("__hmr_register")
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "untracked-atom",
        fromName: "config",
        target: "define({ factory: () => ({}) }) from ../lib/lite",
      }),
    ])
  })

  it("reports atom calls imported through common Vite alias barrels", () => {
    const code = `import { atom } from '@/lib/lite'
const config = atom({ factory: () => ({}) })`
    const filePath = "src/alias.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).not.toContain("__hmr_register")
    expect(result!.meta.issues).toEqual([
      expect.objectContaining({
        code: "untracked-atom",
        fromName: "config",
        target: "atom({ factory: () => ({}) }) from @/lib/lite",
      }),
    ])
  })

  it("does not report package atom imports as Lite HMR issues", () => {
    const code = `import { atom } from 'jotai'
const config = atom(0)`
    const filePath = "src/jotai.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("does not report locally shadowed barrel atom imports", () => {
    const code = `import { atom } from '../lib/lite'
function make() {
  const atom = (input: unknown) => input
  return atom({ factory: () => ({}) })
}`
    const filePath = "src/shadow.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("returns null when no atom() calls present", () => {
    const code = `const x = 1`
    const filePath = "src/noatom.ts"

    const result = transformAtoms(code, filePath)

    expect(result).toBeNull()
  })

  it("uses file and handle name for stable keys", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const a = atom({ factory: () => 1 })
const b = atom({ factory: () => 2 })`
    const filePath = "src/multi.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.code).toContain("__hmr_register(\"src/multi.ts:a\"")
    expect(result!.code).toContain("__hmr_register(\"src/multi.ts:b\"")
    expect(result!.meta.atoms.map((atom) => atom.name)).toEqual(["a", "b"])
  })

  it("keeps keys stable when lines move", () => {
    const first = transformAtoms(`import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`, "src/atoms.ts")
    const second = transformAtoms(`

import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`, "src/atoms.ts")

    expect(first?.meta.atoms[0]?.key).toBe("src/atoms.ts:config")
    expect(second?.meta.atoms[0]?.key).toBe("src/atoms.ts:config")
    expect(first?.meta.atoms[0]?.line).toBe(2)
    expect(second?.meta.atoms[0]?.line).toBe(4)
  })

  it("generates sourcemap", () => {
    const code = `import { atom } from '@pumped-fn/lite'
const config = atom({ factory: () => ({}) })`
    const filePath = "src/atoms.ts"

    const result = transformAtoms(code, filePath)

    expect(result).not.toBeNull()
    expect(result!.map).toBeDefined()
  })
})
