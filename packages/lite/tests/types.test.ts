import { describe, it, expectTypeOf } from "vitest"
import {
  atom,
  flow,
  tag,
  tags,
  controller,
  type Lite,
} from "../src/index"

describe("Type Inference", () => {
  describe("atom dependencies", () => {
    it("should infer deps for atom without dependencies", () => {
      const configAtom = atom({
        factory: (ctx) => ({ port: 3000, host: "localhost" }),
      })

      type ConfigType = typeof configAtom extends Lite.Atom<infer T> ? T : never
      expectTypeOf<ConfigType>().toEqualTypeOf<{
        port: number
        host: string
      }>()
    })

    it("should infer deps for atom with atom dependencies", () => {
      const configAtom = atom({
        factory: () => ({ port: 3000 }),
      })

      const dbAtom = atom({
        deps: { cfg: configAtom },
        factory: (ctx, deps) => {
          expectTypeOf(deps.cfg).toEqualTypeOf<{ port: number }>()
          return { query: (sql: string) => [] as unknown[] }
        },
      })

      type DbType = typeof dbAtom extends Lite.Atom<infer T> ? T : never
      expectTypeOf<DbType>().toEqualTypeOf<{
        query: (sql: string) => unknown[]
      }>()
    })

    it("should infer controller dependency as Controller", () => {
      const serviceAtom = atom({
        factory: () => ({ expensive: true }),
      })

      atom({
        deps: { svc: controller(serviceAtom) },
        factory: async (ctx, deps) => {
          expectTypeOf(deps.svc).toEqualTypeOf<Lite.Controller<{ expensive: boolean }>>()
          await deps.svc.resolve()
          const value = deps.svc.get()
          expectTypeOf(value).toEqualTypeOf<{ expensive: boolean }>()
          return value
        },
      })
    })

    it("should infer required tag as T", () => {
      const userIdTag = tag<string>({ label: "userId" })

      atom({
        deps: { userId: tags.required(userIdTag) },
        factory: (ctx, deps) => {
          expectTypeOf(deps.userId).toEqualTypeOf<string>()
          return { id: deps.userId }
        },
      })
    })

    it("should infer optional tag as T | undefined", () => {
      const countTag = tag<number>({ label: "count" })

      atom({
        deps: { count: tags.optional(countTag) },
        factory: (ctx, deps) => {
          expectTypeOf(deps.count).toEqualTypeOf<number | undefined>()
          return deps.count ?? 0
        },
      })
    })

    it("should infer all tag as T[]", () => {
      const featureTag = tag<string>({ label: "feature" })

      atom({
        deps: { features: tags.all(featureTag) },
        factory: (ctx, deps) => {
          expectTypeOf(deps.features).toEqualTypeOf<string[]>()
          return deps.features
        },
      })
    })

    it("should infer mixed dependencies correctly", () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serviceAtom = atom({ factory: () => ({ name: "service" }) })
      const userIdTag = tag<string>({ label: "userId" })
      const countTag = tag<number>({ label: "count" })
      const featureTag = tag<string>({ label: "feature" })

      atom({
        deps: {
          cfg: configAtom,
          svc: controller(serviceAtom),
          userId: tags.required(userIdTag),
          count: tags.optional(countTag),
          features: tags.all(featureTag),
        },
        factory: (ctx, deps) => {
          expectTypeOf(deps.cfg).toEqualTypeOf<{ port: number }>()
          expectTypeOf(deps.svc).toEqualTypeOf<Lite.Controller<{ name: string }>>()
          expectTypeOf(deps.userId).toEqualTypeOf<string>()
          expectTypeOf(deps.count).toEqualTypeOf<number | undefined>()
          expectTypeOf(deps.features).toEqualTypeOf<string[]>()
          return "combined"
        },
      })
    })
  })

  describe("flow dependencies", () => {
    it("should infer deps for flow with dependencies", () => {
      const dbAtom = atom({
        factory: () => ({ query: (sql: string) => [] }),
      })

      flow({
        deps: { db: dbAtom },
        factory: (ctx, deps) => {
          expectTypeOf(deps.db).toEqualTypeOf<{ query: (sql: string) => never[] }>()
          return deps.db.query("SELECT 1")
        },
      })
    })

    it("should infer mixed deps for flow with atoms and tags", () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serviceAtom = atom({ factory: () => ({ name: "service" }) })
      const requestIdTag = tag<string>({ label: "requestId" })
      const countTag = tag<number>({ label: "count" })
      const featureTag = tag<string>({ label: "feature" })

      flow({
        deps: {
          cfg: configAtom,
          svc: controller(serviceAtom),
          reqId: tags.required(requestIdTag),
          count: tags.optional(countTag),
          features: tags.all(featureTag),
        },
        factory: (ctx, deps) => {
          expectTypeOf(deps.cfg).toEqualTypeOf<{ port: number }>()
          expectTypeOf(deps.svc).toEqualTypeOf<Lite.Controller<{ name: string }>>()
          expectTypeOf(deps.reqId).toEqualTypeOf<string>()
          expectTypeOf(deps.count).toEqualTypeOf<number | undefined>()
          expectTypeOf(deps.features).toEqualTypeOf<string[]>()
          return { input: ctx.input }
        },
      })
    })
  })
})
