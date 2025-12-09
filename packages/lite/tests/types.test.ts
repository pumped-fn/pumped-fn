import { describe, it, expect, expectTypeOf } from "vitest"
import {
  atom,
  flow,
  typed,
  tag,
  tags,
  controller,
  createScope,
  service,
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

      const consumerAtom = atom({
        deps: { svc: controller(serviceAtom) },
        factory: async (ctx, deps) => {
          expectTypeOf(deps.svc).toEqualTypeOf<Lite.Controller<{ expensive: boolean }>>()
          await deps.svc.resolve()
          const value = deps.svc.get()
          expectTypeOf(value).toEqualTypeOf<{ expensive: boolean }>()
          return value
        },
      })

      type ConsumerType = typeof consumerAtom extends Lite.Atom<infer T> ? T : never
      expectTypeOf<ConsumerType>().toEqualTypeOf<{ expensive: boolean }>()
    })

    it("should infer required tag as T", () => {
      const userIdTag = tag<string>({ label: "userId" })

      const userAtom = atom({
        deps: { userId: tags.required(userIdTag) },
        factory: (ctx, deps) => {
          expectTypeOf(deps.userId).toEqualTypeOf<string>()
          return { id: deps.userId }
        },
      })

      type UserType = typeof userAtom extends Lite.Atom<infer T> ? T : never
      expectTypeOf<UserType>().toEqualTypeOf<{ id: string }>()
    })

    it("should infer optional tag as T | undefined", () => {
      const countTag = tag<number>({ label: "count" })

      const counterAtom = atom({
        deps: { count: tags.optional(countTag) },
        factory: (ctx, deps) => {
          expectTypeOf(deps.count).toEqualTypeOf<number | undefined>()
          return deps.count ?? 0
        },
      })

      type CounterType = typeof counterAtom extends Lite.Atom<infer T> ? T : never
      expectTypeOf<CounterType>().toEqualTypeOf<number>()
    })

    it("should infer all tag as T[]", () => {
      const featureTag = tag<string>({ label: "feature" })

      const featuresAtom = atom({
        deps: { features: tags.all(featureTag) },
        factory: (ctx, deps) => {
          expectTypeOf(deps.features).toEqualTypeOf<string[]>()
          return deps.features
        },
      })

      type FeaturesType = typeof featuresAtom extends Lite.Atom<infer T> ? T : never
      expectTypeOf<FeaturesType>().toEqualTypeOf<string[]>()
    })

    it("should infer mixed dependencies correctly", () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serviceAtom = atom({ factory: () => ({ name: "service" }) })
      const userIdTag = tag<string>({ label: "userId" })
      const countTag = tag<number>({ label: "count" })
      const featureTag = tag<string>({ label: "feature" })

      const combinedAtom = atom({
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

      type CombinedType = typeof combinedAtom extends Lite.Atom<infer T> ? T : never
      expectTypeOf<CombinedType>().toEqualTypeOf<string>()
    })
  })

  describe("flow dependencies", () => {
    it("should infer deps for flow with dependencies", () => {
      const dbAtom = atom({
        factory: () => ({ query: (sql: string) => [] }),
      })

      const queryFlow = flow({
        deps: { db: dbAtom },
        factory: (ctx, deps) => {
          expectTypeOf(deps.db).toEqualTypeOf<{ query: (sql: string) => never[] }>()
          return deps.db.query("SELECT 1")
        },
      })

      type QueryFlowType = typeof queryFlow extends Lite.Flow<infer T, infer _> ? T : never
      expectTypeOf<QueryFlowType>().toEqualTypeOf<never[]>()
    })

    it("should infer mixed deps for flow with atoms and tags", () => {
      const configAtom = atom({ factory: () => ({ port: 3000 }) })
      const serviceAtom = atom({ factory: () => ({ name: "service" }) })
      const requestIdTag = tag<string>({ label: "requestId" })
      const countTag = tag<number>({ label: "count" })
      const featureTag = tag<string>({ label: "feature" })

      const mixedFlow = flow({
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

      type MixedFlowType = typeof mixedFlow extends Lite.Flow<infer T, infer _> ? T : never
      expectTypeOf<MixedFlowType>().toEqualTypeOf<{ input: unknown }>()
    })
  })

  describe("parse type inference", () => {
    describe("Tag with parse", () => {
      it("infers type from parse return", () => {
        const numberTag = tag({
          label: "count",
          parse: (raw: unknown): number => {
            const n = Number(raw)
            if (isNaN(n)) throw new Error("Must be number")
            return n
          },
        })

        const tagged = numberTag(42)
        expectTypeOf(tagged.value).toEqualTypeOf<number>()
      })
    })

    describe("Flow with parse", () => {
      it("infers ctx.input from parse return", async () => {
        type ParsedInput = { name: string }

        const myFlow = flow({
          parse: (raw: unknown): ParsedInput => {
            if (typeof raw !== "object" || raw === null) {
              throw new Error("Must be object")
            }
            const obj = raw as Record<string, unknown>
            if (typeof obj["name"] !== "string") {
              throw new Error("name must be string")
            }
            return { name: obj["name"] }
          },
          factory: (ctx) => {
            expectTypeOf(ctx.input).toEqualTypeOf<ParsedInput>()
            return ctx.input.name.toUpperCase()
          },
        })

        type FlowInputType = typeof myFlow extends Lite.Flow<unknown, infer TInput>
          ? TInput
          : never
        expectTypeOf<FlowInputType>().toEqualTypeOf<ParsedInput>()

        const scope = createScope()
        const ctx = scope.createContext()
        const result = await ctx.exec({
          flow: myFlow as unknown as Lite.Flow<string, unknown>,
          input: { name: "test" },
        })
        expect(result).toBe("TEST")
        await ctx.close()
      })

      it("ctx.input is void without parse (no input required)", async () => {
        const myFlow = flow({
          factory: (ctx) => {
            return String(ctx.input)
          },
        })

        type FlowInputType = typeof myFlow extends Lite.Flow<unknown, infer TInput>
          ? TInput
          : never
        expectTypeOf<FlowInputType>().toEqualTypeOf<void>()

        const scope = createScope()
        const ctx = scope.createContext()
        const result = await ctx.exec({ flow: myFlow })
        expect(result).toBe("undefined")
        await ctx.close()
      })

      it("infers ctx.input from typed() marker", async () => {
        type TypedInput = { id: number; name: string }

        const myFlow = flow({
          parse: typed<TypedInput>(),
          factory: (ctx) => {
            expectTypeOf(ctx.input).toEqualTypeOf<TypedInput>()
            return `${ctx.input.id}: ${ctx.input.name}`
          },
        })

        type FlowInputType = typeof myFlow extends Lite.Flow<unknown, infer TInput>
          ? TInput
          : never
        expectTypeOf<FlowInputType>().toEqualTypeOf<TypedInput>()

        const scope = createScope()
        const ctx = scope.createContext()
        const result = await ctx.exec({
          flow: myFlow as unknown as Lite.Flow<string, unknown>,
          input: { id: 1, name: "test" },
        })
        expect(result).toBe("1: test")
        await ctx.close()
      })
    })
  })

  describe("service type constraints", () => {
    it("should enforce methods have ExecutionContext as first parameter", () => {
      const validService = service({
        factory: () => ({
          greet: (ctx: Lite.ExecutionContext, name: string) => `Hello, ${name}`,
          count: (ctx: Lite.ExecutionContext) => 42,
        }),
      })

      type ServiceType = typeof validService extends Lite.Service<infer T> ? T : never
      expectTypeOf<ServiceType>().toMatchTypeOf<Lite.ServiceMethods>()
    })

    it("should infer service method types correctly", () => {
      const dbService = service({
        factory: () => ({
          query: (ctx: Lite.ExecutionContext, sql: string) => [] as unknown[],
          insert: (ctx: Lite.ExecutionContext, table: string, data: object) => 1,
        }),
      })

      type DbServiceType = typeof dbService extends Lite.Service<infer T> ? T : never

      expectTypeOf<DbServiceType["query"]>().toMatchTypeOf<(ctx: Lite.ExecutionContext, sql: string) => unknown[]>()
      expectTypeOf<DbServiceType["insert"]>().toMatchTypeOf<(ctx: Lite.ExecutionContext, table: string, data: object) => number>()
    })

    it("should work with dependencies", () => {
      const configAtom = atom({ factory: () => ({ prefix: "DB" }) })

      const serviceWithDeps = service({
        deps: { config: configAtom },
        factory: (ctx, { config }) => ({
          format: (execCtx: Lite.ExecutionContext, msg: string) => `[${config.prefix}] ${msg}`,
        }),
      })

      type ServiceType = typeof serviceWithDeps extends Lite.Service<infer T> ? T : never
      expectTypeOf<ServiceType>().toMatchTypeOf<Lite.ServiceMethods>()
    })

    it("resolves service and invokes methods correctly", async () => {
      const counterService = service({
        factory: () => {
          let count = 0
          return {
            increment: (ctx: Lite.ExecutionContext) => ++count,
            getCount: (ctx: Lite.ExecutionContext) => count,
          }
        },
      })

      const scope = createScope()
      await scope.ready

      const counter = await scope.resolve(counterService)
      const ctx = scope.createContext()

      await ctx.exec({ fn: counter.increment, params: [] })
      const result = await ctx.exec({ fn: counter.getCount, params: [] })

      expect(result).toBe(1)

      await ctx.close()
      await scope.dispose()
    })

    it("rejects methods without ExecutionContext as first parameter", () => {
      // @ts-expect-error - methods must have ExecutionContext as first param
      const invalidService = service({
        factory: () => ({
          // Missing ExecutionContext parameter
          badMethod: (name: string) => `Hello, ${name}`,
        }),
      })

      // This test exists to verify the type constraint at compile time
      expect(invalidService).toBeDefined()
    })
  })
})
