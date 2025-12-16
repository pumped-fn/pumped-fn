import { describe, it, expect, beforeEach } from "vitest"
import jscodeshift from "jscodeshift"
import type { API, FileInfo, Options } from "jscodeshift"
import { transform, getCollector } from "../../src/transforms/core-next-to-lite"

function runTransform(source: string, filename = "test.ts"): string | undefined {
  const fileInfo: FileInfo = {
    path: filename,
    source,
  }

  const j = jscodeshift.withParser("tsx")
  const api: API = {
    jscodeshift: j,
    j,
    stats: () => {},
    report: () => {},
  } as unknown as API
  const options: Options = {}

  return transform(fileInfo, api, options)
}

describe("core-next-to-lite integration", () => {
  beforeEach(() => {
    getCollector().clear()
  })

  it("transforms complete file with all patterns", () => {
    const input = `import { provide, derive } from "@pumped-fn/core-next"
import type { Core } from "@pumped-fn/core-next"

const configAtom = provide((ctl) => ({ port: 3000 }))
const dbAtom = derive([configAtom], ([config], ctl) => new DB(config))
const lazyDb = dbAtom.lazy
type MyExecutor = Core.Executor<string>`

    const expected = `import { atom, controller } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"

const configAtom = atom({
  factory: (ctx) => ({ port: 3000 })
})
const dbAtom = atom({
  deps: {
    config: configAtom
  },

  factory: (
    ctx,
    {
      config
    }
  ) => new DB(config)
})
const lazyDb = controller(dbAtom)
type MyExecutor = Lite.Atom<string>`

    const result = runTransform(input)

    expect(result?.trim()).toBe(expected.trim())
  })

  it("transforms controller methods and accessors", () => {
    const input = `import { provide } from "@pumped-fn/core-next"

const atom1 = provide((ctl) => {
  ctl.release()
  ctl.reload()
  return 42
})
const reactive = atom1.reactive
const staticVal = atom1.static`

    const expected = `import { atom, controller } from "@pumped-fn/lite";

const atom1 = atom({
  factory: (ctx) => {
    ctx.invalidate()
    ctx.invalidate()
    return 42
  }
})
const reactive = controller(atom1)
const staticVal = controller(atom1)`

    const result = runTransform(input)

    expect(result?.trim()).toBe(expected.trim())
  })

  it("transforms complex derive with tags and types", () => {
    const input = `import { derive, tag } from "@pumped-fn/core-next"
import type { Core } from "@pumped-fn/core-next"

const myTag = tag("db")
const dbAtom = derive([configAtom, apiAtom], ([config, api], ctl) => {
  return new DB(config, api)
}, myTag)
type DbAccessor = Core.Accessor<typeof dbAtom>`

    const expected = `import { atom, tag } from "@pumped-fn/lite"
import type { Lite } from "@pumped-fn/lite"

const myTag = tag("db")
const dbAtom = atom({
  deps: {
    config: configAtom,
    api: apiAtom
  },

  factory: (
    ctx,
    {
      config,
      api
    }
  ) => {
    return new DB(config, api)
  },

  tags: [myTag]
})
type DbAccessor = Lite.Controller<typeof dbAtom>`

    const result = runTransform(input)

    expect(result?.trim()).toBe(expected.trim())
  })

  it("adds controller import when accessors are used", () => {
    const input = `import { provide } from "@pumped-fn/core-next"

const atom1 = provide(() => 42)
const lazy = atom1.lazy`

    const expected = `import { atom, controller } from "@pumped-fn/lite";

const atom1 = atom({
  factory: () => 42
})
const lazy = controller(atom1)`

    const result = runTransform(input)

    expect(result?.trim()).toBe(expected.trim())
  })

  it("collects edge cases for static accessor", () => {
    const input = `import { provide } from "@pumped-fn/core-next"

const atom1 = provide(() => 42)
const staticVal = atom1.static`

    runTransform(input)

    const report = getCollector().getReport()
    expect(report.edgeCases).toHaveLength(1)
    expect(report.edgeCases[0].category).toBe("static_accessor")
    expect(report.edgeCases[0].pattern).toBe(".static")
  })

  it("tracks file processed in stats", () => {
    const input = `import { provide } from "@pumped-fn/core-next"

const atom1 = provide(() => 42)`

    runTransform(input)

    const report = getCollector().getReport()
    expect(report.stats.filesProcessed).toBe(1)
  })

  it("handles files with no core-next imports", () => {
    const input = `import { foo } from "other-package"

const x = 42`

    const result = runTransform(input)

    expect(result).toBeUndefined()
  })

  it("transforms multiple atoms with mixed patterns", () => {
    const input = `import { provide, derive } from "@pumped-fn/core-next"

const atom1 = provide((ctl) => 1)
const atom2 = provide((controller) => 2)
const atom3 = derive([atom1], ([a], ctl) => a + 1)
const lazy1 = atom1.lazy
const reactive2 = atom2.reactive`

    const expected = `import { atom, controller } from "@pumped-fn/lite"

const atom1 = atom({
  factory: (ctx) => 1
})
const atom2 = atom({
  factory: (ctx) => 2
})
const atom3 = atom({
  deps: {
    a: atom1
  },

  factory: (
    ctx,
    {
      a
    }
  ) => a + 1
})
const lazy1 = controller(atom1)
const reactive2 = controller(atom2)`

    const result = runTransform(input)

    expect(result?.trim()).toBe(expected.trim())
  })

  it("transforms nested controller usages", () => {
    const input = `import { provide } from "@pumped-fn/core-next"

const atom1 = provide((ctl) => {
  const nested = () => {
    ctl.reload()
  }
  ctl.release()
  return nested
})`

    const expected = `import { atom } from "@pumped-fn/lite"

const atom1 = atom({
  factory: (ctx) => {
    const nested = () => {
      ctx.invalidate()
    }
    ctx.invalidate()
    return nested
  }
})`

    const result = runTransform(input)

    expect(result?.trim()).toBe(expected.trim())
  })
})
