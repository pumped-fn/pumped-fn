# Delivery: seam, lifecycle, composition

## One test seam

Every test owns `createScope({ presets, tags, extensions })`, invokes a public handle, closes the context with the true result, and disposes. No `vi.mock`, global patch, internal reach, shared scope builder, or test mode. A fake has the real edge's shape. Inside-out presets direct deps; outside-in presets only adapters.

Concurrency is coordinated, never timed: promise gates for races, manual scheduler backends for ticks, `changes` iterators for wake ordering. Store the public execution promise once, optionally assert its type, then await that same promise.

Lifecycle rules:

- Success: `await ctx.close({ ok: true })` only after the entire boundary succeeds.
- Catch: `await ctx.close({ ok: false, error })`, then rethrow.
- Stream abandonment must close as `{ ok: false, aborted: true }` and roll back.
- Recovery uses two scopes sharing one durable fake: first leaves pending state and fails; second recovers exactly once.
- Current-owned completed children are already settled; parent-owned resources follow parent close.
- Stop registrations/loops first, then close context, then dispose scope. Assert close results.

## Complete garden composition

`src/garden.ts`

```ts
import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"

export interface Pump {
  deliver(ml: number): Promise<void>
}

export const plot = tag<string>({ label: "garden.plot" })

export const pump = atom({
  factory: () => ({ deliver: async (_ml: number) => {} }) satisfies Pump,
})

export const session = resource({
  name: "watering-session",
  ownership: "current",
  factory: (ctx) => {
    const entries: string[] = []
    ctx.onClose(() => {})
    return entries
  },
})

export const record = flow({
  name: "record-watering",
  parse: typed<{ plot: string; ml: number }>(),
  deps: { session },
  factory: (ctx, { session }) => {
    session.push(`${ctx.input.plot}:${ctx.input.ml}`)
    return session.length
  },
})

export const waterBed = flow({
  name: "water-bed",
  parse: typed<{ ml: number }>(),
  deps: {
    plot: tags.required(plot),
    pump,
    record: controller(record),
  },
  factory: async (ctx, { plot, pump, record }) => {
    await ctx.exec({
      name: "pump.deliver",
      deps: {},
      params: [pump, ctx.input.ml],
      fn: (_deps, target, ml) => target.deliver(ml),
    })
    const entries = await record.exec({ input: { plot, ml: ctx.input.ml } })
    return { entries, plot, watered: ctx.input.ml }
  },
})
```

`bin/main.ts`

```ts
import { createScope } from "@pumped-fn/lite"
import { plot, waterBed } from "../src/garden.js"

const scope = createScope({ tags: [plot("herbs")] })
const ctx = scope.createContext()
try {
  console.log(await ctx.exec({ flow: waterBed, input: { ml: 300 } }))
  await ctx.close({ ok: true })
} catch (error) {
  await ctx.close({ ok: false, error })
  throw error
} finally {
  await scope.dispose()
}
```

`tests/garden.test.ts`

```ts
import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, expectTypeOf, it } from "vitest"
import { plot, pump, waterBed } from "../src/garden.js"

describe("waterBed", () => {
  it("uses the public seam", async () => {
    const delivered: number[] = []
    const scope = createScope({
      presets: [preset(pump, {
        deliver: async (ml: number) => { delivered.push(ml) },
      })],
      tags: [plot("herbs")],
    })
    const ctx = scope.createContext()
    const run = ctx.exec({ flow: waterBed, input: { ml: 300 } })
    expectTypeOf(run).toEqualTypeOf<Promise<{ entries: number; plot: string; watered: number }>>()
    await expect(run).resolves.toEqual({ entries: 1, plot: "herbs", watered: 300 })
    expect(delivered).toEqual([300])
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
```

The no-op `onClose` demonstrates ownership without inventing persistence. Production resources put real commit/rollback there.

## Final gate

1. Trace every effect to a declared dependency and every injected capability to a tag/port.
2. Confirm root/test alone owns scope/context; child flows use controllers.
3. Check resource owner and close result; scheduler registration stops before disposal.
4. Check deterministic race/recovery tests and real-shaped fakes.
5. Check every foreign call has `params` and a name; both rejection and domain “no” become declared faults where required.
6. Diff each public result/fault/yield against the requested contract. Never turn a count into a list.
7. Run lint to zero including warnings, then typecheck and tests.
