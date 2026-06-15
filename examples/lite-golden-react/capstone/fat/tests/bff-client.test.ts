import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { bffClient } from "../src/app"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: GET /dashboard with Bearer token returns parsed DashboardView on ok", async () => {
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

  test("IO2: non-ok response throws", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 403, json: async () => ({}) }))

    const scope = createScope()
    const client = await scope.resolve(bffClient)
    await expect(client.dashboard("bad-token")).rejects.toThrow()
    await scope.dispose()
  })
})
