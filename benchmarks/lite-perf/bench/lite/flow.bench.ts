import { bench, describe } from "vitest"
import { flow, type Lite } from "@pumped-fn/lite"
import { consume, noop, resolvedController } from "./graphs"

const { scope, atom: depAtom } = await resolvedController(() => 42)
const parent = scope.createContext()

const emptyFlow = flow({ factory: () => 1 })
const depFlow = flow({ deps: { a: depAtom }, factory: (_ctx, d) => d.a })

let nested: Lite.Flow<number, void> = flow({ factory: () => 0 })
for (let i = 0; i < 9; i++) {
  const inner = nested
  nested = flow({ factory: async (ctx) => (await ctx.exec({ flow: inner })) + 1 })
}

const fnTarget = (_ctx: Lite.ExecutionContext, x: number) => x

describe("execution context", () => {
  bench("createContext + close", async () => {
    const ctx = scope.createContext()
    await ctx.close()
  })

  bench("exec flow (no deps, sync factory)", async () => {
    consume(await parent.exec({ flow: emptyFlow }))
  })

  bench("exec flow (1 resolved atom dep)", async () => {
    consume(await parent.exec({ flow: depFlow }))
  })

  bench("exec fn", async () => {
    consume(await parent.exec({ fn: fnTarget, params: [7] }))
  })

  bench("exec nested flows depth 10", async () => {
    consume(await parent.exec({ flow: nested }))
  })

  bench("createContext + 100 onClose + close", async () => {
    const ctx = scope.createContext()
    for (let i = 0; i < 100; i++) ctx.onClose(noop)
    await ctx.close()
  })

  bench("onClose subscribe + unsubscribe x100 (FIFO)", () => {
    const ctx = scope.createContext()
    const unsubs: (() => void)[] = []
    for (let i = 0; i < 100; i++) unsubs.push(ctx.onClose(noop))
    for (let i = 0; i < 100; i++) unsubs[i]!()
  })
})
