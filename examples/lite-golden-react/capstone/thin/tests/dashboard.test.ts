import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { bffClient, type BffClient, type DashboardView } from "../src/bff"
import { sessionToken } from "../src/session"
import { signIn } from "../src/signIn"
import { dashboard } from "../src/dashboard"

const fakeDash: DashboardView = {
  summary: { total: 3, healthy: 2, unhealthy: 1, unknown: 0, activeIncidents: 1 },
  attention: [{ id: "s1", name: "api", status: "unhealthy", criticality: "high" }],
}

describe("inside-out", () => {
  test("IO1: dashboard is null when token is null", async () => {
    const scope = createScope({ presets: [preset(bffClient, { login: async () => ({ token: "" }), dashboard: async () => fakeDash })] })
    const result = await scope.resolve(dashboard)
    expect(result).toBeNull()
    await scope.dispose()
  })

  test("IO2: dashboard loads via preset bffClient when token present", async () => {
    const tokenCalls: string[] = []
    const trackingClient: BffClient = {
      login: async () => ({ token: "" }),
      dashboard: async (token) => { tokenCalls.push(token); return fakeDash },
    }
    const scope = createScope({
      presets: [preset(bffClient, trackingClient), preset(sessionToken, "tok-xyz")],
    })
    const result = await scope.resolve(dashboard)
    expect(result).toEqual(fakeDash)
    expect(tokenCalls).toContain("tok-xyz")
    await scope.dispose()
  })

  test("IO3: dashboard re-loads after signIn sets token (watch cascade)", async () => {
    const tokenCalls: string[] = []
    const trackingClient: BffClient = {
      login: async () => ({ token: "tok-login" }),
      dashboard: async (token) => { tokenCalls.push(token); return fakeDash },
    }
    const scope = createScope({ presets: [preset(bffClient, trackingClient)] })
    expect(await scope.resolve(dashboard)).toBeNull()

    const ctx = scope.createContext()
    await ctx.exec({ flow: signIn, input: { email: "a@b.com", password: "pass" } })
    await ctx.close({ ok: true })
    await scope.flush()

    const result = await scope.resolve(dashboard)
    expect(result).toEqual(fakeDash)
    expect(tokenCalls).toContain("tok-login")
    await scope.dispose()
  })
})
