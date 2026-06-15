import { afterEach, describe, expect, test, vi } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { InvalidCredentials, InvalidSession, authHttp, authProvider, type AuthHttp } from "../src/auth"

const session = { token: "t", user: { id: "u1", name: "Alice" } }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("inside-out", () => {
  test("IO1: authProvider authenticates through authHttp", async () => {
    const calls: { path: string; body: unknown }[] = []
    const http: AuthHttp = {
      post: async <T>(path: string, body: unknown) => {
        calls.push({ path, body })
        return session as T
      },
      get: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(authHttp, http)] })

    const provider = await scope.resolve(authProvider)
    const result = await provider.authenticate("a@b.com", "pass")

    expect(calls).toEqual([{ path: "/authenticate", body: { email: "a@b.com", password: "pass" } }])
    expect(result).toEqual(session)
    await scope.dispose()
  })

  test("IO2: authProvider validates through authHttp", async () => {
    const calls: { path: string; token: string }[] = []
    const http: AuthHttp = {
      post: async () => {
        throw new Error("not used")
      },
      get: async <T>(path: string, token: string) => {
        calls.push({ path, token })
        return session as T
      },
    }
    const scope = createScope({ presets: [preset(authHttp, http)] })

    const provider = await scope.resolve(authProvider)
    const result = await provider.validate("tok-session")

    expect(calls).toEqual([{ path: "/session", token: "tok-session" }])
    expect(result).toEqual(session)
    await scope.dispose()
  })

  test("IO3: authProvider propagates authHttp denials", async () => {
    const http: AuthHttp = {
      post: async () => {
        throw new InvalidCredentials()
      },
      get: async () => {
        throw new InvalidSession()
      },
    }
    const scope = createScope({ presets: [preset(authHttp, http)] })

    const provider = await scope.resolve(authProvider)

    await expect(provider.authenticate("a@b.com", "wrong")).rejects.toThrow("invalid credentials")
    await expect(provider.validate("bad-token")).rejects.toThrow("invalid session")
    await scope.dispose()
  })

  test("IO4: authHttp POST /authenticate with correct path returns parsed Session on ok", async () => {
    const calls: { url: string; method: string; body: string }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, method: init.method ?? "GET", body: init.body as string })
      return { ok: true, json: async () => session }
    })

    const scope = createScope()
    const http = await scope.resolve(authHttp)
    const result = await http.post("/authenticate", { email: "a@b.com", password: "pass" })

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url).toBe("http://localhost:4000/authenticate")
    expect(call.method).toBe("POST")
    expect(JSON.parse(call.body)).toEqual({ email: "a@b.com", password: "pass" })
    expect(result).toEqual(session)
    await scope.dispose()
  })

  test("IO5: authHttp non-ok POST response throws 'invalid credentials'", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }))

    const scope = createScope()
    const http = await scope.resolve(authHttp)
    await expect(http.post("/authenticate", { email: "a@b.com", password: "wrong" })).rejects.toThrow(
      "invalid credentials",
    )
    await scope.dispose()
  })

  test("IO6: authHttp GET /session validates a Bearer token and returns parsed Session on ok", async () => {
    const calls: { url: string; auth: string }[] = []
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>
      calls.push({ url, auth: headers["Authorization"] ?? "" })
      return { ok: true, json: async () => session }
    })

    const scope = createScope()
    const http = await scope.resolve(authHttp)
    const result = await http.get("/session", "tok-session")

    expect(calls).toEqual([{ url: "http://localhost:4000/session", auth: "Bearer tok-session" }])
    expect(result).toEqual(session)
    await scope.dispose()
  })

  test("IO7: authHttp non-ok GET response throws 'invalid session'", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }))

    const scope = createScope()
    const http = await scope.resolve(authHttp)
    await expect(http.get("/session", "bad-token")).rejects.toThrow("invalid session")
    await scope.dispose()
  })
})
