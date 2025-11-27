import { describe, it, expect } from "vitest"
import { createScope } from "../src/scope"
import { atom, lazy } from "../src/atom"
import { preset } from "../src/preset"
import { tag, tags } from "../src/tag"
import { flow } from "../src/flow"

describe("Scope", () => {
  describe("createScope()", () => {
    it("creates a scope", async () => {
      const scope = await createScope()
      expect(scope).toBeDefined()
      expect(scope.resolve).toBeTypeOf("function")
      expect(scope.accessor).toBeTypeOf("function")
      expect(scope.release).toBeTypeOf("function")
      expect(scope.dispose).toBeTypeOf("function")
    })
  })

  describe("scope.resolve()", () => {
    it("resolves atom without deps", async () => {
      const scope = await createScope()
      const myAtom = atom({ factory: () => 42 })

      const result = await scope.resolve(myAtom)
      expect(result).toBe(42)
    })

    it("resolves atom with deps", async () => {
      const scope = await createScope()
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serverAtom = atom({
        deps: { cfg: configAtom },
        factory: (ctx, { cfg }) => ({ port: cfg.port }),
      })

      const result = await scope.resolve(serverAtom)
      expect(result).toEqual({ port: 3000 })
    })

    it("caches resolved values", async () => {
      const scope = await createScope()
      let callCount = 0
      const myAtom = atom({
        factory: () => {
          callCount++
          return callCount
        },
      })

      const first = await scope.resolve(myAtom)
      const second = await scope.resolve(myAtom)

      expect(first).toBe(1)
      expect(second).toBe(1)
      expect(callCount).toBe(1)
    })

    it("resolves async factories", async () => {
      const scope = await createScope()
      const myAtom = atom({
        factory: async () => {
          await new Promise((r) => setTimeout(r, 10))
          return "async result"
        },
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe("async result")
    })

    it("uses preset value", async () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const scope = await createScope({
        presets: [preset(configAtom, { port: 8080 })],
      })

      const result = await scope.resolve(configAtom)
      expect(result).toEqual({ port: 8080 })
    })

    it("uses preset atom", async () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const testConfigAtom = atom({ factory: () => ({ port: 9999 }) })
      const scope = await createScope({
        presets: [preset(configAtom, testConfigAtom)],
      })

      const result = await scope.resolve(configAtom)
      expect(result).toEqual({ port: 9999 })
    })
  })

  describe("scope.accessor()", () => {
    it("returns accessor for atom", async () => {
      const scope = await createScope()
      const myAtom = atom({ factory: () => 42 })

      const accessor = scope.accessor(myAtom)
      expect(accessor).toBeDefined()

      await accessor.resolve()
      expect(accessor.get()).toBe(42)
    })

    it("accessor.get() throws if not resolved", async () => {
      const scope = await createScope()
      const myAtom = atom({ factory: () => 42 })

      const accessor = scope.accessor(myAtom)
      expect(() => accessor.get()).toThrow()
    })
  })

  describe("lazy deps", () => {
    it("resolves lazy dep as accessor", async () => {
      const scope = await createScope()
      const optionalAtom = atom({ factory: () => "optional" })
      const mainAtom = atom({
        deps: { opt: lazy(optionalAtom) },
        factory: async (ctx, { opt }) => {
          await opt.resolve()
          return opt.get()
        },
      })

      const result = await scope.resolve(mainAtom)
      expect(result).toBe("optional")
    })
  })

  describe("tag deps", () => {
    it("resolves required tag from scope tags", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = await createScope({
        tags: [tenantId("tenant-123")],
      })

      const myAtom = atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBe("tenant-123")
    })

    it("throws for missing required tag", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = await createScope()

      const myAtom = atom({
        deps: { tenant: tags.required(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      await expect(scope.resolve(myAtom)).rejects.toThrow()
    })

    it("resolves optional tag as undefined", async () => {
      const tenantId = tag<string>({ label: "tenantId" })
      const scope = await createScope()

      const myAtom = atom({
        deps: { tenant: tags.optional(tenantId) },
        factory: (ctx, { tenant }) => tenant,
      })

      const result = await scope.resolve(myAtom)
      expect(result).toBeUndefined()
    })
  })

  describe("cleanup", () => {
    it("runs cleanup on release", async () => {
      const scope = await createScope()
      let cleaned = false
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => {
            cleaned = true
          })
          return 42
        },
      })

      await scope.resolve(myAtom)
      expect(cleaned).toBe(false)

      await scope.release(myAtom)
      expect(cleaned).toBe(true)
    })

    it("runs cleanups in LIFO order", async () => {
      const scope = await createScope()
      const order: number[] = []
      const myAtom = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { order.push(1) })
          ctx.cleanup(() => { order.push(2) })
          ctx.cleanup(() => { order.push(3) })
          return 42
        },
      })

      await scope.resolve(myAtom)
      await scope.release(myAtom)

      expect(order).toEqual([3, 2, 1])
    })
  })

  describe("dispose", () => {
    it("releases all atoms", async () => {
      const scope = await createScope()
      const cleanups: string[] = []

      const a = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { cleanups.push("a") })
          return "a"
        },
      })
      const b = atom({
        factory: (ctx) => {
          ctx.cleanup(() => { cleanups.push("b") })
          return "b"
        },
      })

      await scope.resolve(a)
      await scope.resolve(b)
      await scope.dispose()

      expect(cleanups).toContain("a")
      expect(cleanups).toContain("b")
    })
  })
})

describe("ExecutionContext", () => {
  describe("createContext()", () => {
    it("creates execution context", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      expect(ctx).toBeDefined()
      expect(ctx.exec).toBeTypeOf("function")
      expect(ctx.close).toBeTypeOf("function")
    })

    it("creates context with tags", async () => {
      const requestId = tag<string>({ label: "requestId" })
      const scope = await createScope()
      const ctx = scope.createContext({
        tags: [requestId("req-123")],
      })

      expect(ctx).toBeDefined()
    })
  })

  describe("ctx.exec() with flow", () => {
    it("executes flow without deps", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        factory: (ctx) => `input: ${ctx.input}`,
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: "hello",
      })

      expect(result).toBe("input: hello")
      await ctx.close()
    })

    it("executes flow with deps", async () => {
      const dbAtom = atom({ factory: () => ({ query: () => "data" }) })
      const scope = await createScope()
      const ctx = scope.createContext()

      const myFlow = flow({
        deps: { db: dbAtom },
        factory: (ctx, { db }) => db.query(),
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
      })

      expect(result).toBe("data")
      await ctx.close()
    })

    it("resolves tag deps from merged sources", async () => {
      const requestId = tag<string>({ label: "requestId" })
      const tenantId = tag<string>({ label: "tenantId" })

      const scope = await createScope({
        tags: [tenantId("tenant-1")],
      })

      const ctx = scope.createContext({
        tags: [requestId("req-123")],
      })

      const myFlow = flow({
        deps: {
          reqId: tags.required(requestId),
          tenant: tags.required(tenantId),
        },
        factory: (ctx, { reqId, tenant }) => ({ reqId, tenant }),
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
      })

      expect(result).toEqual({
        reqId: "req-123",
        tenant: "tenant-1",
      })

      await ctx.close()
    })

    it("exec tags override context tags", async () => {
      const requestId = tag<string>({ label: "requestId" })

      const scope = await createScope()
      const ctx = scope.createContext({
        tags: [requestId("ctx-id")],
      })

      const myFlow = flow({
        deps: { reqId: tags.required(requestId) },
        factory: (ctx, { reqId }) => reqId,
      })

      const result = await ctx.exec({
        flow: myFlow,
        input: null,
        tags: [requestId("exec-id")],
      })

      expect(result).toBe("exec-id")
      await ctx.close()
    })
  })

  describe("ctx.exec() with fn", () => {
    it("executes plain function", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      const result = await ctx.exec({
        fn: (a: number, b: number) => a + b,
        params: [1, 2],
      })

      expect(result).toBe(3)
      await ctx.close()
    })
  })

  describe("ctx.onClose()", () => {
    it("runs cleanup on close", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      let cleaned = false
      ctx.onClose(() => {
        cleaned = true
      })

      expect(cleaned).toBe(false)
      await ctx.close()
      expect(cleaned).toBe(true)
    })

    it("runs cleanups in LIFO order", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()

      const order: number[] = []
      ctx.onClose(() => { order.push(1) })
      ctx.onClose(() => { order.push(2) })
      ctx.onClose(() => { order.push(3) })

      await ctx.close()
      expect(order).toEqual([3, 2, 1])
    })
  })

  describe("closed context", () => {
    it("throws when executing on closed context", async () => {
      const scope = await createScope()
      const ctx = scope.createContext()
      await ctx.close()

      const myFlow = flow({ factory: () => 42 })

      await expect(
        ctx.exec({ flow: myFlow, input: null })
      ).rejects.toThrow("closed")
    })
  })
})
