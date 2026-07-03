import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { bffClient, bffHttp, type BffHttp } from "../src/app"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: bffHttp GET /dashboard with Bearer token returns parsed DashboardView on ok", async () => {
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
    const http = await scope.resolve(bffHttp)
    const result = await http.get("/dashboard", "my-token")

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe("http://localhost:4001/dashboard")
    expect(call.auth).toBe("Bearer my-token")
    expect(result).toEqual(payload)
    await scope.dispose()
  })

  test("IO2: bffHttp non-ok response throws", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 403, json: async () => ({}) }))

    const scope = createScope()
    const http = await scope.resolve(bffHttp)
    await expect(http.get("/dashboard", "bad-token")).rejects.toThrow("bff /dashboard failed: 403")
    await scope.dispose()
  })

  test("IO3: bffClient delegates dashboard to the transport atom", async () => {
    const calls: Array<{ path: string; token: string }> = []
    const payload = {
      summary: { total: 1, healthy: 1, unhealthy: 0, unknown: 0, activeIncidents: 0 },
      attention: [],
    }
    const http: BffHttp = {
      get: async <T>(path: string, token: string) => {
        calls.push({ path, token })
        return payload as T
      },
    }
    const scope = createScope({ presets: [preset(bffHttp, http)] })
    const client = await scope.resolve(bffClient)
    await expect(client.dashboard("my-token")).resolves.toEqual(payload)
    expect(calls).toEqual([{ path: "/dashboard", token: "my-token" }])
    await scope.dispose()
  })
})
