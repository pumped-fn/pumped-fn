# Worked example: garden watering controller

This is one complete small composition. `pump` is a transport atom; `plot` is a contextual tag; `wateringSession` is a current-owned resource; `recordWatering` is a child flow; `waterBed` composes it through a controller dependency. The root owns logging. The test replaces only the pump through the scope seam.

## `src/garden.ts`

```ts
import { atom, controller, flow, resource, tag, tags, typed } from "@pumped-fn/lite"

export interface Pump {
  deliver(ml: number): Promise<void>
}

export const plot = tag<string>({ label: "garden.plot" })

export const pump = atom({
  factory: () => ({
    deliver: async (_ml: number) => {},
  }) satisfies Pump,
})

export const wateringSession = resource({
  name: "watering-session",
  ownership: "current",
  factory: (ctx) => {
    const events: string[] = []
    ctx.onClose((result) => { events.push(result.ok ? "commit" : "discard") })
    return { events }
  },
})

export const recordWatering = flow({
  name: "record-watering",
  parse: typed<{ plot: string; ml: number }>(),
  deps: { wateringSession },
  factory: (ctx, { wateringSession }) => {
    wateringSession.events.push(`${ctx.input.plot}:${ctx.input.ml}`)
    return wateringSession.events.length
  },
})

export const waterBed = flow({
  name: "water-bed",
  parse: typed<{ ml: number }>(),
  deps: {
    plot: tags.required(plot),
    pump,
    recordWatering: controller(recordWatering, { name: "record-watering" }),
  },
  factory: async (ctx, { plot, pump, recordWatering }) => {
    await ctx.exec({ fn: () => pump.deliver(ctx.input.ml), name: "pump.deliver" })
    const entries = await recordWatering.exec({ input: { plot, ml: ctx.input.ml } })
    return { entries, plot, watered: ctx.input.ml }
  },
})
```

`current` makes the session private to each top-level action while a child flow executed by that action sees the same session. The close result controls commit/discard; do not move it into the flow body.

## `bin/main.ts`

```ts
import { createScope } from "@pumped-fn/lite"
import { logging } from "@pumped-fn/lite-extension-logging"
import { plot, waterBed } from "../src/garden.js"

const sink = { write: (record: { level: string; message: string }) => console.log(record.level, record.message) }
const scope = createScope({
  extensions: [logging.extension()],
  tags: [plot("herbs"), logging.runtime({ flow: "all", sinks: [sink] })],
})
const ctx = scope.createContext()
console.log(await ctx.exec({ flow: waterBed, input: { ml: 300 } }))
await ctx.close({ ok: true })
await scope.dispose()
```

## `tests/garden.test.ts`

```ts
import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { plot, pump, waterBed } from "../src/garden.js"

describe("waterBed", () => {
  it("uses the preset pump through the public flow", async () => {
    const delivered: number[] = []
    const scope = createScope({
      presets: [preset(pump, { deliver: async (ml: number) => { delivered.push(ml) } })],
      tags: [plot("herbs")],
    })
    const ctx = scope.createContext()
    await expect(ctx.exec({ flow: waterBed, input: { ml: 300 } })).resolves.toEqual({
      entries: 1,
      plot: "herbs",
      watered: 300,
    })
    expect(delivered).toEqual([300])
    await ctx.close({ ok: true })
    await scope.dispose()
  })
})
```

For a failed action, the boundary catches the error and closes `ctx` with `{ ok: false, error }`; the resource records `discard`. Do not use `vi.mock` to reach that branch.
