import { describe, it, expect } from "vitest"
import { createScope, flow, isFault, typed, FlowFault } from "../src/index"

type Fault =
  | { kind: "conflict"; id: string }
  | { kind: "not-found"; id: string }

describe("typed faults", () => {
  it("ctx.fail throws a FlowFault carrying the fault and flow name", async () => {
    const pairPayment = flow({
      name: "pairPayment",
      faults: typed<Fault>(),
      factory: (ctx) => ctx.fail({ kind: "conflict", id: "p1" }),
    })

    const scope = createScope()
    await expect(scope.createContext().exec({ flow: pairPayment })).rejects.toMatchObject({
      fault: { kind: "conflict", id: "p1" },
      flow: "pairPayment",
    })
  })

  it("isFault narrows by declared type and flow-name match", async () => {
    const pairPayment = flow({
      name: "pairPayment",
      faults: typed<Fault>(),
      factory: (ctx) => ctx.fail({ kind: "not-found", id: "p2" }),
    })

    const scope = createScope()
    try {
      await scope.createContext().exec({ flow: pairPayment })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(FlowFault)
      expect(isFault(pairPayment, error)).toBe(true)
      if (isFault(pairPayment, error)) {
        expect(error.fault.kind).toBe("not-found")
      }
    }
  })

  it("isFault rejects errors from a different flow name", async () => {
    const a = flow({ name: "a", faults: typed<{ kind: "x" }>(), factory: (ctx) => ctx.fail({ kind: "x" }) })
    const b = flow({ name: "b", faults: typed<{ kind: "y" }>(), factory: () => undefined })

    const scope = createScope()
    try {
      await scope.createContext().exec({ flow: a })
      expect.unreachable()
    } catch (error) {
      expect(isFault(b, error)).toBe(false)
    }
  })

  it("flows without declared faults are unaffected (no fault, no runtime cost)", async () => {
    const plain = flow({ factory: () => 42 })
    const scope = createScope()
    expect(await scope.createContext().exec({ flow: plain })).toBe(42)
  })

  it("fail propagates through nested exec composition", async () => {
    const child = flow({
      name: "child",
      faults: typed<{ kind: "child-fault" }>(),
      factory: (ctx) => ctx.fail({ kind: "child-fault" }),
    })
    const parent = flow({
      name: "parent",
      deps: { child },
      faults: typed<{ kind: "child-fault" }>(),
      factory: async (_ctx, { child }) => {
        await child.exec()
      },
    })

    const scope = createScope()
    await expect(scope.createContext().exec({ flow: parent })).rejects.toMatchObject({
      fault: { kind: "child-fault" },
      flow: "child",
    })
  })
})
