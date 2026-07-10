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
    const run = ctx.exec({ flow: waterPlant, input: { ml: 250 } })
    expectTypeOf(run).toEqualTypeOf<Promise<{ watered: number }>>()
    await expect(run).resolves.toEqual({ watered: 250 })
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

- Assert close outcomes for resources owned by the parent/boundary. A completed `current`-owned child cannot be retroactively failed by a later parent close.
- For a stream abandoned with `break`, assert `{ ok: false, aborted: true }` at the close recorder; its resource must roll back/cleanup.
- Test crash recovery with two scopes sharing the same durable fake/preset: scope one leaves pending state then closes unsuccessfully; scope two runs public recovery and proves persisted work is recovered exactly once.
- Always call `await ctx.close({ ok: true })` only after the whole boundary succeeded. In a catch, close `{ ok: false, error }`, then rethrow. Always `await scope.dispose()`.

Concurrency correctness comes from controlled edges, not elapsed time.

For a resource-backed transaction, put awaited `commit` and the subsequent `signal` in the same successful `ctx.onClose` callback; assert that order through a fake durable store. For an inline store transaction, commit then signal in the flow. Put the work item in state, not in the wakeup iterator. For graceful shutdown, execute a public `stop` flow that flips a state atom and signals loops, then await loop results before closing the root context.

## Minimal starter composition

The smallest complete `src/`, `bin/`, `tests/` set — one atom, one tag with a `default`, one flow, a root, and a test through `preset`/tag override:

`src/app.ts`

```ts
import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"

export const recipient = tag<string>({ label: "app.recipient", default: "world" })
export const salutation = atom({ factory: () => "hello" })

export const greet = flow({
  name: "greet",
  parse: typed<void>(),
  deps: { salutation, recipient: tags.required(recipient) },
  factory: (_ctx, { salutation, recipient }) => ({ text: `${salutation}, ${recipient}` }),
})
```

`bin/main.ts`

```ts
import { createScope } from "@pumped-fn/lite"
import { greet } from "../src/app.ts"

const scope = createScope()
const ctx = scope.createContext()
const { text } = await ctx.exec({ flow: greet })
console.log(text)
await ctx.close({ ok: true })
await scope.dispose()
```

`tests/app.test.ts`

```ts
import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { greet, recipient, salutation } from "../src/app.ts"

describe("greet", () => {
  it("derives the greeting from the preset salutation and tag override", async () => {
    const scope = createScope({
      presets: [preset(salutation, "howdy")],
      tags: [recipient("gardeners")],
    })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: greet })).resolves.toEqual({ text: "howdy, gardeners" })
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
```

`tags: [recipient("gardeners")]` at `createScope` is what the root context inherits since nothing more specific sets `recipient` first — this is the scope layer in the tag resolution order (see SKILL.md's "Tag resolution order").
