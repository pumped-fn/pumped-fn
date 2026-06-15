import { describe, test, expect, vi, afterEach } from "vitest"
import { createScope } from "@pumped-fn/lite"
import { authProvider } from "../src/auth"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: POST /authenticate with correct path returns parsed Session on ok", async () => {
    const calls: { url: string; method: string; body: string }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body as string })
      return { ok: true, json: async () => ({ token: "t", user: { id: "u1", name: "Alice" } }) }
    })

    const scope = createScope()
    const provider = await scope.resolve(authProvider)
    const result = await provider.authenticate("a@b.com", "pass")

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe("http://localhost:4000/authenticate")
    expect(call.method).toBe("POST")
    expect(JSON.parse(call.body)).toEqual({ email: "a@b.com", password: "pass" })
    expect(result).toEqual({ token: "t", user: { id: "u1", name: "Alice" } })
    await scope.dispose()
  })

  test("IO2: non-ok response throws 'invalid credentials'", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }))

    const scope = createScope()
    const provider = await scope.resolve(authProvider)
    await expect(provider.authenticate("a@b.com", "wrong")).rejects.toThrow("invalid credentials")
    await scope.dispose()
  })
})
