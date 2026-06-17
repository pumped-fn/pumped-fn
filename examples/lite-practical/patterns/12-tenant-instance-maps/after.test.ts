import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import {
  cleanupSink,
  recordUsage,
  strategy,
  tenant,
  tenantIdentity,
  tenantSnapshot,
  tierPresets,
} from "./after"

describe("inside-out", () => {
  test("IO1: atom reads tags.required(tenant) -> per-scope identity", async () => {
    const alpha = createScope({ tags: [tenant("tenant-a")], presets: tierPresets("free") })
    const beta = createScope({ tags: [tenant("tenant-b")], presets: tierPresets("pro") })

    expect(await alpha.resolve(tenantIdentity)).toEqual({ tenantId: "tenant-a" })
    expect(await beta.resolve(tenantIdentity)).toEqual({ tenantId: "tenant-b" })
  })

  test("IO2: plan-tier preset swaps strategy atom (free vs pro) per tenant scope", async () => {
    const free = createScope({ tags: [tenant("tenant-free")], presets: tierPresets("free") })
    const pro = createScope({ tags: [tenant("tenant-pro")], presets: tierPresets("pro") })

    expect(await createScope().resolve(strategy)).toMatchObject({
      name: "free",
      limit: 1,
    })
    expect(await free.resolve(strategy)).toMatchObject({
      name: "free",
      limit: 1,
    })
    expect(await pro.resolve(strategy)).toMatchObject({
      name: "pro",
      limit: 100,
    })
  })
})

describe("outside-in", () => {
  test("OI1: same atoms, two scopes -> independent state (counter diverges)", async () => {
    const alpha = createScope({ tags: [tenant("tenant-a")], presets: tierPresets("free") })
    const beta = createScope({ tags: [tenant("tenant-b")], presets: tierPresets("free") })
    const alphaCtx = alpha.createContext()
    const betaCtx = beta.createContext()

    expect(await alphaCtx.exec({
      flow: recordUsage,
      input: { units: 3 },
    })).toMatchObject({
      tenantId: "tenant-a",
      plan: "free",
      count: 1,
      receipt: "tenant-a:free:1",
    })
    expect(await alphaCtx.exec({
      flow: recordUsage,
      input: { units: 4 },
    })).toMatchObject({
      tenantId: "tenant-a",
      count: 2,
    })
    expect(await betaCtx.exec({
      flow: recordUsage,
      input: { units: 9 },
    })).toMatchObject({
      tenantId: "tenant-b",
      plan: "free",
      count: 1,
      receipt: "tenant-b:free:1",
    })
  })

  test("OI2: flows exec'd in tenant A's scope never observe B's values", async () => {
    const alpha = createScope({ tags: [tenant("tenant-a")], presets: tierPresets("pro") })
    const beta = createScope({ tags: [tenant("tenant-b")], presets: tierPresets("free") })
    const alphaCtx = alpha.createContext()
    const betaCtx = beta.createContext()

    await alphaCtx.exec({
      flow: recordUsage,
      input: { units: 10 },
    })
    await betaCtx.exec({
      flow: recordUsage,
      input: { units: 20 },
    })

    expect(await alphaCtx.exec({ flow: tenantSnapshot })).toEqual({
      tenantId: "tenant-a",
      plan: "pro",
      count: 1,
      limit: 100,
    })
    expect(await betaCtx.exec({ flow: tenantSnapshot })).toEqual({
      tenantId: "tenant-b",
      plan: "free",
      count: 1,
      limit: 1,
    })
  })
})

describe("effect-managed", () => {
  test("E1: dispose tenant A -> A's cleanups all ran; B untouched and still serving", async () => {
    const cleanupLog: string[] = []
    const alpha = createScope({
      tags: [tenant("tenant-a")],
      presets: [...tierPresets("free"), preset(cleanupSink, cleanupLog)],
    })
    const beta = createScope({
      tags: [tenant("tenant-b")],
      presets: [...tierPresets("pro"), preset(cleanupSink, cleanupLog)],
    })
    const alphaCtx = alpha.createContext()
    const betaCtx = beta.createContext()

    await alphaCtx.exec({
      flow: recordUsage,
      input: { units: 1 },
    })
    await betaCtx.exec({
      flow: recordUsage,
      input: { units: 2 },
    })
    await alpha.dispose()

    expect(cleanupLog).toEqual(["closed:tenant-a:1"])
    expect(await betaCtx.exec({ flow: tenantSnapshot })).toEqual({
      tenantId: "tenant-b",
      plan: "pro",
      count: 1,
      limit: 100,
    })

    await beta.dispose()
    expect(cleanupLog).toEqual(["closed:tenant-a:1", "closed:tenant-b:1"])
  })
})
