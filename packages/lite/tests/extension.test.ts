import { describe, it, expect, vi } from "vitest"
import { createScope } from "../src/scope"
import { atom } from "../src/atom"
import { flow } from "../src/flow"
import type { Lite } from "../src/types"

describe("Extension", () => {
  describe("init", () => {
    it("calls init with scope on creation", async () => {
      let receivedScope: Lite.Scope | undefined
      const ext: Lite.Extension = {
        name: "test",
        init: (scope) => {
          receivedScope = scope
        },
      }

      const scope = createScope({ extensions: [ext] })
      expect(receivedScope).toBe(scope)
    })
  })

  describe("wrapResolve", () => {
    it("wraps atom resolution", async () => {
      const calls: string[] = []
      const ext: Lite.Extension = {
        name: "test",
        wrapResolve: async (next, atom, scope) => {
          calls.push("before")
          const result = await next()
          calls.push("after")
          return result
        },
      }

      const scope = createScope({ extensions: [ext] })
      const myAtom = atom({ factory: () => 42 })

      await scope.resolve(myAtom)
      expect(calls).toEqual(["before", "after"])
    })

    it("chains multiple extensions", async () => {
      const order: string[] = []

      const ext1: Lite.Extension = {
        name: "ext1",
        wrapResolve: async (next) => {
          order.push("ext1-before")
          const result = await next()
          order.push("ext1-after")
          return result
        },
      }

      const ext2: Lite.Extension = {
        name: "ext2",
        wrapResolve: async (next) => {
          order.push("ext2-before")
          const result = await next()
          order.push("ext2-after")
          return result
        },
      }

      const scope = createScope({ extensions: [ext1, ext2] })
      const myAtom = atom({ factory: () => 42 })

      await scope.resolve(myAtom)

      expect(order).toEqual([
        "ext1-before",
        "ext2-before",
        "ext2-after",
        "ext1-after",
      ])
    })
  })

  describe("wrapExec", () => {
    it("wraps flow execution", async () => {
      const calls: string[] = []
      const ext: Lite.Extension = {
        name: "test",
        wrapExec: async (next, target, ctx) => {
          calls.push("before")
          const result = await next()
          calls.push("after")
          return result
        },
      }

      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()
      const myFlow = flow({ factory: () => 42 })

      await ctx.exec({ flow: myFlow, input: null })
      expect(calls).toEqual(["before", "after"])

      await ctx.close()
    })

    it("chains multiple extensions for flow execution", async () => {
      const order: string[] = []

      const ext1: Lite.Extension = {
        name: "ext1",
        wrapExec: async (next) => {
          order.push("ext1-before")
          const result = await next()
          order.push("ext1-after")
          return result
        },
      }

      const ext2: Lite.Extension = {
        name: "ext2",
        wrapExec: async (next) => {
          order.push("ext2-before")
          const result = await next()
          order.push("ext2-after")
          return result
        },
      }

      const scope = createScope({ extensions: [ext1, ext2] })
      const ctx = scope.createContext()
      const myFlow = flow({ factory: () => 42 })

      await ctx.exec({ flow: myFlow, input: null })

      expect(order).toEqual([
        "ext1-before",
        "ext2-before",
        "ext2-after",
        "ext1-after",
      ])

      await ctx.close()
    })

    it("wraps plain function execution with auto-injected ctx", async () => {
      const calls: string[] = []
      const ext: Lite.Extension = {
        name: "test",
        wrapExec: async (next) => {
          calls.push("before")
          const result = await next()
          calls.push("after")
          return result
        },
      }

      const scope = createScope({ extensions: [ext] })
      const ctx = scope.createContext()

      await ctx.exec({
        fn: (_ctx: Lite.ExecutionContext, a: number, b: number) => a + b,
        params: [1, 2],
      })
      expect(calls).toEqual(["before", "after"])

      await ctx.close()
    })

  })

  describe("dispose", () => {
    it("calls dispose with scope on scope dispose", async () => {
      let receivedScope: Lite.Scope | undefined
      const ext: Lite.Extension = {
        name: "test",
        dispose: (scope) => {
          receivedScope = scope
        },
      }

      const scope = createScope({ extensions: [ext] })
      await scope.dispose()

      expect(receivedScope).toBe(scope)
    })

    it("calls dispose for multiple extensions", async () => {
      const dispose1 = vi.fn()
      const dispose2 = vi.fn()

      const ext1: Lite.Extension = {
        name: "ext1",
        dispose: dispose1,
      }

      const ext2: Lite.Extension = {
        name: "ext2",
        dispose: dispose2,
      }

      const scope = createScope({ extensions: [ext1, ext2] })
      await scope.dispose()

      expect(dispose1).toHaveBeenCalledTimes(1)
      expect(dispose2).toHaveBeenCalledTimes(1)
    })
  })

  describe("extension lifecycle", () => {
    it("runs all hooks in correct order", async () => {
      const events: string[] = []

      const ext: Lite.Extension = {
        name: "lifecycle",
        init: () => {
          events.push("init")
        },
        wrapResolve: async (next) => {
          events.push("resolve-before")
          const result = await next()
          events.push("resolve-after")
          return result
        },
        wrapExec: async (next) => {
          events.push("exec-before")
          const result = await next()
          events.push("exec-after")
          return result
        },
        dispose: () => {
          events.push("dispose")
        },
      }

      const scope = createScope({ extensions: [ext] })
      expect(events).toEqual(["init"])

      const myAtom = atom({ factory: () => "value" })
      await scope.resolve(myAtom)
      expect(events).toEqual(["init", "resolve-before", "resolve-after"])

      const ctx = scope.createContext()
      const myFlow = flow({ factory: () => "result" })
      await ctx.exec({ flow: myFlow, input: null })
      expect(events).toEqual([
        "init",
        "resolve-before",
        "resolve-after",
        "exec-before",
        "exec-after",
      ])

      await ctx.close()
      await scope.dispose()
      expect(events).toEqual([
        "init",
        "resolve-before",
        "resolve-after",
        "exec-before",
        "exec-after",
        "dispose",
      ])
    })
  })
})
