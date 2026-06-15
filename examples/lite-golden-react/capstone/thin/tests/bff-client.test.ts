import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { bffClient, bffHttp, type BffHttp } from "../src/bff"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: bffHttp POST /login with email/password returns token", async () => {
    const calls: { url: string; method: string; body: string }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body as string })
      return { ok: true, json: async () => ({ token: "tok-bff" }) }
    })

    const scope = createScope()
    const http = await scope.resolve(bffHttp)
    const result = await http.post("/login", { email: "a@b.com", password: "pass" })

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe("http://localhost:4001/login")
    expect(call.method).toBe("POST")
    expect(JSON.parse(call.body)).toEqual({ email: "a@b.com", password: "pass" })
    expect(result).toEqual({ token: "tok-bff" })
    await scope.dispose()
  })

  test("IO2: bffHttp GET /dashboard with Bearer token returns DashboardView", async () => {
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

  test("IO3: bffHttp non-ok response on login throws", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }))
    const scope = createScope()
    const http = await scope.resolve(bffHttp)
    await expect(http.post("/login", { email: "a@b.com", password: "bad" })).rejects.toThrow(
      "bff /login failed: 401"
    )
    await scope.dispose()
  })

  test("IO4: bffHttp non-ok response on dashboard throws", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 403, json: async () => ({}) }))
    const scope = createScope()
    const http = await scope.resolve(bffHttp)
    await expect(http.get("/dashboard", "bad-token")).rejects.toThrow("bff /dashboard failed: 403")
    await scope.dispose()
  })

  test("IO5: bffClient delegates login and dashboard to bffHttp", async () => {
    const calls: Array<{ method: "post" | "get"; path: string; value: unknown }> = []
    const dashboard = {
      summary: { total: 1, healthy: 1, unhealthy: 0, unknown: 0, activeIncidents: 0 },
      attention: [],
    }
    const http: BffHttp = {
      post: async <T>(path: string, body: unknown) => {
        calls.push({ method: "post", path, value: body })
        return { token: "tok-bff" } as T
      },
      get: async <T>(path: string, token: string) => {
        calls.push({ method: "get", path, value: token })
        return dashboard as T
      },
    }
    const scope = createScope({ presets: [preset(bffHttp, http)] })
    const client = await scope.resolve(bffClient)
    await expect(client.login("a@b.com", "pass")).resolves.toEqual({ token: "tok-bff" })
    await expect(client.dashboard("tok-bff")).resolves.toEqual(dashboard)
    expect(calls).toEqual([
      { method: "post", path: "/login", value: { email: "a@b.com", password: "pass" } },
      { method: "get", path: "/dashboard", value: "tok-bff" },
    ])
    await scope.dispose()
  })
})
