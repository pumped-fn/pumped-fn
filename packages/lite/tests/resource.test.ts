import { describe, it, expect } from "vitest"
import { atom, flow, resource, isResource, tag, tags, createScope } from "../src/index"
import type { Lite } from "../src/types"

describe("resource", () => {
  describe("isResource type guard", () => {
    it("returns true for resource", () => {
      const r = resource({ factory: () => 42 })
      expect(isResource(r)).toBe(true)
    })

    it("returns false for atom", () => {
      const a = atom({ factory: () => 42 })
      expect(isResource(a)).toBe(false)
    })

    it("returns false for flow", () => {
      const f = flow({ factory: () => 42 })
      expect(isResource(f)).toBe(false)
    })

    it("returns false for plain object", () => {
      expect(isResource({ factory: () => 42 })).toBe(false)
    })

    it("returns false for null", () => {
      expect(isResource(null)).toBe(false)
    })

    it("returns false for undefined", () => {
      expect(isResource(undefined)).toBe(false)
    })
  })

  describe("basic resource resolution", () => {
    it("resolves resource with no deps in a flow", async () => {
      const scope = createScope()
      await scope.ready

      let factoryCalled = false
      const r = resource({
        factory: () => {
          factoryCalled = true
          return 42
        },
      })

      const testFlow = flow({
        deps: { val: r },
        factory: (_ctx, { val }) => val,
      })

      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: testFlow })

      expect(factoryCalled).toBe(true)
      expect(result).toBe(42)

      await ctx.close()
      await scope.dispose()
    })
  })

  describe("resource with atom deps", () => {
    it("resolves atom dependency from scope", async () => {
      const configAtom = atom({ factory: () => ({ dbUrl: "postgres://localhost" }) })

      const dbResource = resource({
        deps: { config: configAtom },
        factory: (_ctx, { config }) => ({ connection: config.dbUrl }),
      })

      const testFlow = flow({
        deps: { db: dbResource },
        factory: (_ctx, { db }) => db.connection,
      })

      const scope = createScope()
      await scope.ready

      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: testFlow })

      expect(result).toBe("postgres://localhost")

      await ctx.close()
      await scope.dispose()
    })
  })

  describe("resource with tag deps", () => {
    it("resolves tag dependency from execution context", async () => {
      const requestIdTag = tag<string>({ label: "requestId" })

      const loggerResource = resource({
        deps: { reqId: tags.required(requestIdTag) },
        factory: (_ctx, { reqId }) => ({ id: reqId }),
      })

      const testFlow = flow({
        deps: { logger: loggerResource },
        factory: (_ctx, { logger }) => logger.id,
      })

      const scope = createScope()
      await scope.ready

      const ctx = scope.createContext({ tags: [requestIdTag("req-abc")] })
      const result = await ctx.exec({ flow: testFlow })

      expect(result).toBe("req-abc")

      await ctx.close()
      await scope.dispose()
    })
  })

  describe("resource-to-resource deps", () => {
    it("resolves resource B before passing to resource A", async () => {
      const order: string[] = []

      const resourceB = resource({
        factory: () => {
          order.push("B")
          return "B-value"
        },
      })

      const resourceA = resource({
        deps: { b: resourceB },
        factory: (_ctx, { b }) => {
          order.push("A")
          return `A(${b})`
        },
      })

      const testFlow = flow({
        deps: { a: resourceA },
        factory: (_ctx, { a }) => a,
      })

      const scope = createScope()
      await scope.ready

      const ctx = scope.createContext()
      const result = await ctx.exec({ flow: testFlow })

      expect(order).toEqual(["B", "A"])
      expect(result).toBe("A(B-value)")

      await ctx.close()
      await scope.dispose()
    })
  })

  describe("seek-up sharing (nested execs)", () => {
    it("nested exec shares resource instance from parent", async () => {
      let factoryCallCount = 0

      const sharedResource = resource({
        factory: () => {
          factoryCallCount++
          return { id: factoryCallCount }
        },
      })

      let innerValue: unknown

      const innerFlow = flow({
        deps: { shared: sharedResource },
        factory: (_ctx, { shared }) => {
          innerValue = shared
        },
      })

      const outerFlow = flow({
        deps: { shared: sharedResource },
        factory: async (ctx, { shared }) => {
          await ctx.exec({ flow: innerFlow })
          return shared
        },
      })

      const scope = createScope()
      await scope.ready

      const ctx = scope.createContext()
      const outerValue = await ctx.exec({ flow: outerFlow })

      expect(factoryCallCount).toBe(1)
      expect(outerValue).toBe(innerValue)

      await ctx.close()
      await scope.dispose()
    })
  })

  describe("sibling sharing", () => {
    it("two sibling execs share resource from parent", async () => {
      let factoryCallCount = 0

      const sharedResource = resource({
        factory: () => {
          factoryCallCount++
          return { id: factoryCallCount }
        },
      })

      const values: unknown[] = []

      const siblingFlow = flow({
        deps: { shared: sharedResource },
        factory: (_ctx, { shared }) => {
          values.push(shared)
        },
      })

      const parentFlow = flow({
        deps: { shared: sharedResource },
        factory: async (ctx) => {
          await ctx.exec({ flow: siblingFlow })
          await ctx.exec({ flow: siblingFlow })
        },
      })

      const scope = createScope()
      await scope.ready

      const ctx = scope.createContext()
      await ctx.exec({ flow: parentFlow })

      expect(factoryCallCount).toBe(1)
      expect(values[0]).toBe(values[1])

      await ctx.close()
      await scope.dispose()
    })
  })

  describe("no scope-level caching", () => {
    it("separate exec chains get separate resource instances", async () => {
      let factoryCallCount = 0

      const perChainResource = resource({
        factory: () => {
          factoryCallCount++
          return { id: factoryCallCount }
        },
      })

      const results: unknown[] = []

      const testFlow = flow({
        deps: { r: perChainResource },
        factory: (_ctx, { r }) => {
          results.push(r)
          return r
        },
      })

      const scope = createScope()
      await scope.ready

      const ctx1 = scope.createContext()
      await ctx1.exec({ flow: testFlow })
      await ctx1.close()

      const ctx2 = scope.createContext()
      await ctx2.exec({ flow: testFlow })
      await ctx2.close()

      expect(factoryCallCount).toBe(2)
      expect(results[0]).not.toBe(results[1])

      await scope.dispose()
    })
  })

  describe("cleanup via onClose", () => {
    it("receives { ok: true } on successful exec", async () => {
      let closeResult: Lite.CloseResult | undefined

      const r = resource({
        factory: (ctx) => {
          ctx.onClose((result) => {
            closeResult = result
          })
          return "value"
        },
      })

      const testFlow = flow({
        deps: { val: r },
        factory: (_ctx, { val }) => val,
      })

      const scope = createScope()
      await scope.ready

      const ctx = scope.createContext()
      await ctx.exec({ flow: testFlow })
      await ctx.close({ ok: true })

      expect(closeResult).toEqual({ ok: true })

      await scope.dispose()
    })

    it("receives { ok: false, error } when flow throws", async () => {
      let closeResult: Lite.CloseResult | undefined
      const testError = new Error("boom")

      const r = resource({
        factory: (ctx) => {
          ctx.onClose((result) => {
            closeResult = result
          })
          return "value"
        },
      })

      const testFlow = flow({
        deps: { val: r },
        factory: () => {
          throw testError
        },
      })

      const scope = createScope()
      await scope.ready

      const ctx = scope.createContext()
      await expect(ctx.exec({ flow: testFlow })).rejects.toThrow("boom")
      await ctx.close({ ok: false, error: testError })

      expect(closeResult).toBeDefined()
      expect(closeResult!.ok).toBe(false)
      expect((closeResult as { ok: false; error: unknown }).error).toBe(testError)

      await scope.dispose()
    })
  })

  describe("extension wrapResolve with resource", () => {
    it("calls wrapResolve with kind=resource and target=resource", async () => {
      const events: Lite.ResolveEvent[] = []

      const ext: Lite.Extension = {
        name: "spy",
        wrapResolve: async (next, event) => {
          events.push(event)
          return next()
        },
      }

      const r = resource({
        factory: () => "resource-value",
      })

      const testFlow = flow({
        deps: { val: r },
        factory: (_ctx, { val }) => val,
      })

      const scope = createScope({ extensions: [ext] })
      await scope.ready

      const ctx = scope.createContext()
      await ctx.exec({ flow: testFlow })

      const resourceEvents = events.filter((e) => e.kind === "resource")
      expect(resourceEvents).toHaveLength(1)
      expect(resourceEvents[0]!.target).toBe(r)

      await ctx.close()
      await scope.dispose()
    })
  })

  describe("atom cannot depend on resource", () => {
    it("throws when atom with resource dep is resolved", async () => {
      const r = resource({ factory: () => 42 })

      const badAtom = atom({
        deps: { val: r as any },
        factory: (_ctx, { val }) => val,
      })

      const scope = createScope()
      await scope.ready

      await expect(scope.resolve(badAtom)).rejects.toThrow(
        "Resource deps require an ExecutionContext"
      )

      await scope.dispose()
    })
  })
})
