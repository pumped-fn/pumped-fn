import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { session, authProvider, login, type AuthProvider, type Session } from "../src/auth"
import { authedBffClient, bffClient, dashboard, type AuthedBffClient, type BffClient, type DashboardView } from "../src/app"

const aSession: Session = { token: "tok-1", user: { id: "u1", name: "Alice" } }

const fakeDashboard: DashboardView = {
  summary: { total: 3, healthy: 2, unhealthy: 1, unknown: 0, activeIncidents: 1 },
  attention: [{ id: "s1", name: "api", status: "unhealthy", criticality: "high" }],
}

const fakeClient: BffClient = {
  dashboard: async (_token) => fakeDashboard,
}

const fakeAuthedClient: AuthedBffClient = {
  dashboard: async () => fakeDashboard,
}

const fakeAuth: AuthProvider = {
  authenticate: async () => aSession,
}

describe("inside-out", () => {
  test("IO1: dashboard is null when no authed client exists", async () => {
    const scope = createScope({ presets: [preset(authedBffClient, null)] })
    const result = await scope.resolve(dashboard)
    expect(result).toBeNull()
    await scope.dispose()
  })

  test("IO2: dashboard loads via preset authedBffClient without knowing session shape", async () => {
    const scope = createScope({ presets: [preset(authedBffClient, fakeAuthedClient)] })
    const result = await scope.resolve(dashboard)
    expect(result).toEqual(fakeDashboard)
    await scope.dispose()
  })

  test("IO3: authedBffClient is null when session is null", async () => {
    const scope = createScope({ presets: [preset(bffClient, fakeClient)] })
    expect(await scope.resolve(authedBffClient)).toBeNull()
    await scope.dispose()
  })

  test("IO4: authedBffClient carries the latest session token to the raw BFF client", async () => {
    const tokenCalls: string[] = []
    const trackingClient: BffClient = {
      dashboard: async (token) => {
        tokenCalls.push(token)
        return fakeDashboard
      },
    }
    const scope = createScope({
      presets: [preset(bffClient, trackingClient), preset(authProvider, fakeAuth)],
    })
    expect(await scope.resolve(authedBffClient)).toBeNull()

    const ctx = scope.createContext()
    await ctx.exec({ flow: login, input: { email: "a@b.com", password: "pass" } })
    await ctx.close({ ok: true })
    await scope.flush()

    const client = await scope.resolve(authedBffClient)
    expect(client).not.toBeNull()
    expect(await client!.dashboard()).toEqual(fakeDashboard)
    expect(tokenCalls).toContain("tok-1")
    await scope.dispose()
  })
})
