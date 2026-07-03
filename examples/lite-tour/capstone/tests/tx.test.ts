import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, test } from "vitest"
import { checkExecutors, runCheck } from "../src/checker"
import type { HealthCheck, Service } from "../src/domain"
import { detectTransition } from "../src/incidents"
import { createMemoryStore, store, storeDriver, storeRevision } from "../src/infra/store"
import { tx } from "../src/infra/tx"
import type { StorePort, StoreTx } from "../src/ports"

function withTxTracking(base: StorePort): { store: StorePort; events: string[] } {
  const events: string[] = []
  const tracked: StorePort = {
    ...base,
    begin() {
      events.push("begin")
      const t = base.begin()
      return {
        ...t,
        async commit() {
          await t.commit()
          events.push("commit")
        },
        async rollback() {
          await t.rollback()
          events.push("rollback")
        },
      }
    },
  }
  return { store: tracked, events }
}

const service: Service = {
  id: "service-1",
  name: "api",
  type: "http",
  endpoint: "https://api.test",
  checkInterval: 60,
  timeout: 1000,
  criticality: "high",
  createdAt: 0,
  updatedAt: 0,
}

const unhealthyExecutors = {
  http: async () => ({ status: "unhealthy" as const, responseTime: null, error: "down" }),
  tcp: async () => ({ status: "healthy" as const, responseTime: 1, error: null }),
  custom: async () => ({ status: "healthy" as const, responseTime: 1, error: null }),
}

function check(id: string, status: HealthCheck["status"]): HealthCheck {
  return {
    id,
    serviceId: service.id,
    status,
    responseTime: status === "healthy" ? 10 : null,
    error: status === "healthy" ? null : "down",
    timestamp: Number(id.slice(1)) * 1000,
  }
}

describe("inside-out", () => {
  test("IO1: the tx resource can be preset so transition tests do not branch product code", async () => {
    const base = createMemoryStore()
    const staged: string[] = []
    const fakeTx: StoreTx = {
      checks: {
        append(c) {
          staged.push(`check:${c.id}`)
        },
      },
      incidents: {
        open(i) {
          staged.push(`open:${i.serviceId}`)
        },
        close(id) {
          staged.push(`close:${id}`)
        },
      },
      async commit() {
        staged.push("commit")
      },
      async rollback() {
        staged.push("rollback")
      },
    }
    const scope = createScope({
      presets: [preset(storeDriver, base), preset(tx, fakeTx)],
    })
    const ctx = scope.createContext()

    await ctx.exec({ flow: detectTransition, input: { service, check: check("c1", "unhealthy") } })
    await ctx.close({ ok: true })

    expect(staged).toEqual([`open:${service.id}`])
    expect(base.incidents.active()).toEqual([])
    await scope.dispose()
  })
})

describe("outside-in", () => {
  test("OI1: transition writes commit through the real tx resource", async () => {
    const base = createMemoryStore()
    const { store: tracked, events } = withTxTracking(base)
    const scope = createScope({ presets: [preset(storeDriver, tracked)] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: detectTransition, input: { service, check: check("c1", "unhealthy") } })
    await ctx.close({ ok: true })

    expect(base.incidents.active()).toHaveLength(1)
    expect(events).toEqual(["begin", "commit"])
    await scope.dispose()
  })

  test("OI2: failed context rolls back incident writes made inside the transaction", async () => {
    const base = createMemoryStore()
    const { store: tracked, events } = withTxTracking(base)
    const scope = createScope({ presets: [preset(storeDriver, tracked)] })
    const ctx = scope.createContext()

    await ctx.exec({ flow: detectTransition, input: { service, check: check("c1", "unhealthy") } })
    await ctx.close({ ok: false, error: new Error("abort") })

    expect(base.incidents.active()).toEqual([])
    expect(events).toEqual(["begin", "rollback"])
    await scope.dispose()
  })

  test("OI3: one begin spans runCheck and detectTransition, committing or rolling back check and incident together", async () => {
    const committed = createMemoryStore()
    committed.services.upsert(service)
    const { store: committedTracked, events: committedEvents } = withTxTracking(committed)
    const commitScope = createScope({
      presets: [preset(storeDriver, committedTracked), preset(checkExecutors, unhealthyExecutors)],
    })
    const commitCtx = commitScope.createContext()

    await commitCtx.exec({ flow: runCheck, input: { serviceId: service.id } })
    await commitCtx.close({ ok: true })

    expect(committedEvents).toEqual(["begin", "commit"])
    expect(committed.checks.latest(service.id)).toMatchObject({ serviceId: service.id, status: "unhealthy" })
    expect(committed.incidents.active()).toHaveLength(1)
    await commitScope.dispose()

    const rolledBack = createMemoryStore()
    rolledBack.services.upsert(service)
    const { store: rolledTracked, events: rolledEvents } = withTxTracking(rolledBack)
    const rollbackScope = createScope({
      presets: [preset(storeDriver, rolledTracked), preset(checkExecutors, unhealthyExecutors)],
    })
    const rollbackCtx = rollbackScope.createContext()

    await expect(rollbackCtx.exec({
      fn: async (fnCtx) => {
        await fnCtx.exec({ flow: runCheck, input: { serviceId: service.id } })
        throw new Error("downstream failed")
      },
      params: [],
    })).rejects.toThrow("downstream failed")
    await rollbackCtx.close({ ok: false, error: new Error("downstream failed") })

    expect(rolledEvents).toEqual(["begin", "rollback"])
    expect(rolledBack.checks.latest(service.id)).toBeUndefined()
    expect(rolledBack.incidents.active()).toEqual([])
    await rollbackScope.dispose()
  })

  test("OI4: interleaved transactions both land their committed writes", async () => {
    const base = createMemoryStore()
    const { store: tracked, events } = withTxTracking(base)
    const scope = createScope({ presets: [preset(storeDriver, tracked)] })
    const ctxA = scope.createContext()
    const ctxB = scope.createContext()

    const txA = await ctxA.resolve(tx)
    txA.checks.append({ ...check("c1", "healthy"), serviceId: "service-a" })
    const txB = await ctxB.resolve(tx)
    txB.checks.append({ ...check("c2", "healthy"), serviceId: "service-b" })
    await ctxA.close({ ok: true })
    await ctxB.close({ ok: true })

    expect(base.checks.latest("service-a")).toMatchObject({ id: "c1" })
    expect(base.checks.latest("service-b")).toMatchObject({ id: "c2" })
    expect(events).toEqual(["begin", "begin", "commit", "commit"])
    await scope.dispose()
  })

  test("OI5: a direct store write made while a foreign transaction is open survives its rollback", async () => {
    const base = createMemoryStore()
    const { store: tracked, events } = withTxTracking(base)
    const scope = createScope({ presets: [preset(storeDriver, tracked)] })
    const wrapped = await scope.resolve(store)
    const ctx = scope.createContext()

    await ctx.resolve(tx)
    wrapped.checks.append(check("c1", "healthy"))
    wrapped.services.upsert(service)
    await ctx.close({ ok: false, error: new Error("abort") })

    expect(base.checks.latest(service.id)).toMatchObject({ id: "c1" })
    expect(base.services.get(service.id)).toBeDefined()
    expect(events).toEqual(["begin", "rollback"])
    await scope.dispose()
  })
})

describe("effect-managed", () => {
  test("E1: tx resource creates a fresh transaction per execution context", async () => {
    const base = createMemoryStore()
    const { store: tracked, events } = withTxTracking(base)
    const scope = createScope({ presets: [preset(storeDriver, tracked)] })

    const okCtx = scope.createContext()
    await okCtx.resolve(tx)
    await okCtx.close({ ok: true })

    const failCtx = scope.createContext()
    await failCtx.resolve(tx)
    await failCtx.close({ ok: false, error: new Error("fail") })

    expect(events).toEqual(["begin", "commit", "begin", "rollback"])
    await scope.dispose()
  })

  test("E2: rollback preserves previously committed incident state", async () => {
    const base = createMemoryStore()
    const { store: tracked, events } = withTxTracking(base)
    const scope = createScope({ presets: [preset(storeDriver, tracked)] })
    const okCtx = scope.createContext()
    const failCtx = scope.createContext()

    await okCtx.exec({ flow: detectTransition, input: { service, check: check("c1", "unhealthy") } })
    await okCtx.close({ ok: true })
    await failCtx.exec({
      flow: detectTransition,
      input: {
        service: { ...service, id: "service-2" },
        check: { ...check("c2", "unhealthy"), serviceId: "service-2" },
      },
    })
    await failCtx.close({ ok: false, error: new Error("abort") })

    expect(base.incidents.active()).toEqual([expect.objectContaining({ serviceId: service.id })])
    expect(events).toEqual(["begin", "commit", "begin", "rollback"])
    await scope.dispose()
  })

  test("E3: staged writes are invisible to reads and watchers until commit, and rollback never cascades", async () => {
    const base = createMemoryStore()
    const { store: tracked } = withTxTracking(base)
    const scope = createScope({ presets: [preset(storeDriver, tracked)] })
    const wrapped = await scope.resolve(store)
    let cascades = 0
    scope.controller(storeRevision).on("resolved", () => {
      cascades++
    })

    const stagedCtx = scope.createContext()
    const staged = await stagedCtx.resolve(tx)
    staged.checks.append(check("c1", "healthy"))
    staged.incidents.open({
      id: "i1",
      serviceId: service.id,
      startedAt: 0,
      recoveredAt: null,
      duration: null,
      checksFailedCount: 1,
    })

    expect(wrapped.checks.latest(service.id)).toBeUndefined()
    expect(wrapped.incidents.active()).toEqual([])
    await scope.flush()
    expect(cascades).toBe(0)

    await stagedCtx.close({ ok: true })
    await scope.flush()
    expect(cascades).toBe(1)
    expect(wrapped.checks.latest(service.id)).toMatchObject({ id: "c1" })
    expect(wrapped.incidents.active()).toHaveLength(1)

    const rolledCtx = scope.createContext()
    const rolled = await rolledCtx.resolve(tx)
    rolled.checks.append(check("c2", "healthy"))
    await rolledCtx.close({ ok: false, error: new Error("abort") })
    await scope.flush()
    expect(cascades).toBe(1)
    expect(wrapped.checks.latest(service.id)).toMatchObject({ id: "c1" })
    await scope.dispose()
  })
})
