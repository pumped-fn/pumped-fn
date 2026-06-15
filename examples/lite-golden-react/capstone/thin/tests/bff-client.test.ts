import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { bffClient } from "../src/bff"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: POST /login with email/password returns token", async () => {
    const calls: { url: string; method: string; body: string }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body as string })
      return { ok: true, json: async () => ({ token: "tok-bff" }) }
    })

    const scope = createScope()
    const client = await scope.resolve(bffClient)
    const result = await client.login("a@b.com", "pass")

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe("http://localhost:4001/login")
    expect(call.method).toBe("POST")
    expect(JSON.parse(call.body)).toEqual({ email: "a@b.com", password: "pass" })
    expect(result).toEqual({ token: "tok-bff" })
    await scope.dispose()
  })

  test("IO2: GET /dashboard with Bearer token returns DashboardView", async () => {
    const calls: { url: string; auth: string }[] = []
    const payload = {
      summary: { total: 1, healthy: 1, unhealthy: 0, unknown: 0, activeIncidents: 0 },
      attention: [],
    }
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const auth = (init.headers as Record<string, string>)["Authorization"] ?? ""
      calls.push({ url, auth })
      return { ok: true, json: async () => payload }
    })

    const scope = createScope()
    const client = await scope.resolve(bffClient)
    const result = await client.dashboard("my-token")

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe("http://localhost:4001/dashboard")
    expect(call.auth).toBe("Bearer my-token")
    expect(result).toEqual(payload)
    await scope.dispose()
  })

  test("IO3: non-ok response on login throws", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }))
    const scope = createScope()
    const client = await scope.resolve(bffClient)
    await expect(client.login("a@b.com", "bad")).rejects.toThrow()
    await scope.dispose()
  })

  test("IO4: non-ok response on dashboard throws", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 403, json: async () => ({}) }))
    const scope = createScope()
    const client = await scope.resolve(bffClient)
    await expect(client.dashboard("bad-token")).rejects.toThrow()
    await scope.dispose()
  })
})
