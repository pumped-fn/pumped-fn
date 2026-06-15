import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { authHttp, authProvider, type AuthHttp, type Session } from "../src/auth"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: authHttp POST /login with correct path returns parsed Session on ok", async () => {
    const calls: { url: string; method: string; body: string }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body as string })
      return { ok: true, json: async () => ({ token: "t", user: { id: "u1", name: "Alice" } }) }
    })

    const scope = createScope()
    const http = await scope.resolve(authHttp)
    const result = await http.post("/login", { email: "a@b.com", password: "pass" })

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe("http://localhost:4000/login")
    expect(call.method).toBe("POST")
    expect(JSON.parse(call.body)).toEqual({ email: "a@b.com", password: "pass" })
    expect(result).toEqual({ token: "t", user: { id: "u1", name: "Alice" } })
    await scope.dispose()
  })

  test("IO2: authHttp non-ok response throws 'invalid credentials'", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }))

    const scope = createScope()
    const http = await scope.resolve(authHttp)
    await expect(http.post("/login", { email: "a@b.com", password: "wrong" })).rejects.toThrow("invalid credentials")
    await scope.dispose()
  })

  test("IO3: authProvider delegates authenticate to authHttp", async () => {
    const calls: Array<{ path: string; body: unknown }> = []
    const session: Session = { token: "t", user: { id: "u1", name: "Alice" } }
    const http: AuthHttp = {
      post: async <T>(path: string, body: unknown) => {
        calls.push({ path, body })
        return session as T
      },
    }
    const scope = createScope({ presets: [preset(authHttp, http)] })
    const provider = await scope.resolve(authProvider)

    await expect(provider.authenticate("a@b.com", "pass")).resolves.toEqual(session)
    expect(calls).toEqual([{ path: "/login", body: { email: "a@b.com", password: "pass" } }])
    await scope.dispose()
  })
})
