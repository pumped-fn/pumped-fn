import { describe, expect, test } from "vitest"
import { atom, preset, type Lite } from "@pumped-fn/lite"
import { authProvider, login, validateSession, type AuthProvider, type Session } from "../src/auth"
import { capstoneClient, type CapstoneClient } from "../src/client"
import { dashboardView, type DashboardView } from "../src/dashboard"
import { mountBff, mountMain } from "../src/main"
import type { Incident, ServiceStatus } from "../src/wire"

const session: Session = { token: "tok-login", user: { id: "u1", name: "Alice" } }

const services: ServiceStatus[] = [
  {
    id: "api",
    name: "api",
    type: "http",
    endpoint: "https://api.example.test",
    checkInterval: 30,
    timeout: 1000,
    criticality: "critical",
    status: "unhealthy",
    createdAt: 0,
    updatedAt: 0,
  },
]

const incidents: Incident[] = [
  { id: "i1", serviceId: "api", startedAt: 0, recoveredAt: null, duration: null, checksFailedCount: 2 },
]

const dashboard: DashboardView = {
  summary: { total: 1, healthy: 0, unhealthy: 1, unknown: 0, activeIncidents: 1 },
  attention: [{ id: "api", name: "api", status: "unhealthy", criticality: "critical" }],
}

function fakeClient(over: Partial<CapstoneClient> = {}): CapstoneClient {
  return {
    listServices: async () => services,
    activeIncidents: async () => incidents,
    uptime: async () => 100,
    getService: async () => {
      throw new Error("not used")
    },
    ...over,
  }
}

function recordScopes(targets: readonly Lite.AnyFlow[], scopes: Lite.Scope[]): Lite.Extension {
  return {
    name: "record-scopes",
    wrapExec: async (next, target, ctx) => {
      if (targets.some((flow) => flow === target)) scopes.push(ctx.scope)
      return next()
    },
  }
}

describe("outside-in", () => {
  test("OI1: mountBff routes HTTP-shaped login requests through the BFF graph", async () => {
    const calls: Array<{ email: string; password: string }> = []
    const auth: AuthProvider = {
      authenticate: async (email, password) => {
        calls.push({ email, password })
        return session
      },
      validate: async () => {
        throw new Error("not used")
      },
    }
    const app = mountBff({ presets: [preset(authProvider, auth)] })

    const response = await app.handle({
      method: "POST",
      path: "/login",
      body: { email: "a@b.com", password: "pass" },
    })

    expect(response).toEqual({ status: 200, body: { token: session.token } })
    expect(calls).toEqual([{ email: "a@b.com", password: "pass" }])
    await app.dispose()
  })

  test("OI2: one mounted BFF scope serves multiple requests", async () => {
    const scopes: Lite.Scope[] = []
    const auth: AuthProvider = {
      authenticate: async () => session,
      validate: async () => session,
    }
    const app = mountBff({
      extensions: [recordScopes([login, validateSession, dashboardView], scopes)],
      presets: [preset(authProvider, auth), preset(capstoneClient, fakeClient())],
    })

    await expect(
      app.handle({
        method: "POST",
        path: "/login",
        body: { email: "a@b.com", password: "pass" },
      })
    ).resolves.toEqual({ status: 200, body: { token: session.token } })
    await expect(
      app.handle({
        method: "GET",
        path: "/dashboard",
        headers: { Authorization: "Bearer tok-dashboard" },
      })
    ).resolves.toEqual({ status: 200, body: dashboard })
    expect(scopes.length).toBeGreaterThan(1)
    expect(scopes.every((scope) => scope === app.scope)).toBe(true)
    await app.dispose()
  })

  test("OI3: mountMain creates the default BFF composition root", async () => {
    const app = mountMain()

    expect(app.scope).toBeDefined()
    await app.dispose()
  })
})

describe("effect-managed", () => {
  test("E1: mounted BFF disposal releases scope-owned state", async () => {
    const cleanups: string[] = []
    const probe = atom({
      factory: (ctx) => {
        ctx.cleanup(() => {
          cleanups.push("probe")
        })
        return "value"
      },
    })
    const app = mountBff()

    await expect(app.scope.resolve(probe)).resolves.toBe("value")
    await app.dispose()

    expect(cleanups).toEqual(["probe"])
  })
})
