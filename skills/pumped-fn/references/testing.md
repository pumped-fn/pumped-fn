# Testing through one seam

Every test owns `createScope({ presets, tags, extensions })`, invokes public API, closes the context honestly, then disposes the scope. `vi.mock` is never allowed. If a test needs an internal reach, global patch, or test-only branch, move that dependency to an atom/tag/port/resource and preset it.

```ts
import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, expectTypeOf, it } from "vitest"
import { hose, waterPlant } from "../src/garden.js"

describe("waterPlant", () => {
  it("records the requested water through the public flow", async () => {
    const calls: number[] = []
    const scope = createScope({
      presets: [preset(hose, { water: async (ml: number) => { calls.push(ml) } })],
    })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: waterPlant, input: { ml: 250 } })).resolves.toEqual({ watered: 250 })
    expectTypeOf(ctx.exec({ flow: waterPlant, input: { ml: 250 } })).toEqualTypeOf<Promise<{ watered: number }>>()
    expect(calls).toEqual([250])
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
```

Use real-shaped fakes: the same interface/flow handle at the edge, not a test-only product mode. Inside-out tests preset direct dependencies; outside-in tests preset only external adapters.

## Deterministic races

Never sleep. Put a gate in a preset backend, manually trigger a scheduler backend, or coordinate with `changes` async iterators.

```ts
function gate() {
  let open!: () => void
  const wait = new Promise<void>((resolve) => { open = resolve })
  return { wait, open }
}

const entered = gate()
const release = gate()
const fakePump = {
  async water(_ml: number) {
    entered.open()
    await release.wait
  },
}
```

Await `entered.wait`, assert the intermediate observable state, call `release.open()`, then await the public flow. For recurring jobs, expose a manual backend whose `trigger()` drives exactly one tick. For wake-on-signal loops, await the relevant `changes` iterator before advancing the producer.

## Lifecycle and recovery

- Assert close outcomes. A successful invocation is not successful if the parent closes `{ ok: false, error }`.
- For a stream abandoned with `break`, assert `{ ok: false, aborted: true }` at the close recorder; its resource must roll back/cleanup.
- Test crash recovery with two scopes sharing the same durable fake/preset: scope one leaves pending state then closes unsuccessfully; scope two runs public recovery and proves persisted work is recovered exactly once.
- Always call `await ctx.close({ ok: true })` only after the whole boundary succeeded. In a catch, close `{ ok: false, error }`, then rethrow. Always `await scope.dispose()`.

Concurrency correctness comes from controlled edges, not elapsed time.

For commit ordering, make a fake durable store expose `commit` and `signal` calls, run the public flow, and assert `commit` precedes `signal`; put the work item in that store, not in the wakeup iterator. For graceful shutdown, execute a public `stop` flow that flips a state atom and signals loops, then await loop results before closing the root context.
