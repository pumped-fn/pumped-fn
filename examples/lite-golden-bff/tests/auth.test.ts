import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { authProvider, login, type AuthProvider, type Session } from "../src/auth"

const aSession: Session = { token: "tok-1", user: { id: "u1", name: "Alice" } }

const fakeAuth: AuthProvider = {
  authenticate: async (_email, _password) => aSession,
}

const throwingAuth: AuthProvider = {
  authenticate: async () => {
    throw new Error("invalid credentials")
  },
}

describe("inside-out", () => {
  test("IO1: login flow returns Session via preset authProvider", async () => {
    const scope = createScope({ presets: [preset(authProvider, fakeAuth)] })
    const ctx = scope.createContext()
    const result = await ctx.exec({ flow: login, input: { email: "a@b.com", password: "pass" } })
    await ctx.close({ ok: true })
    expect(result).toEqual(aSession)
    await scope.dispose()
  })

  test("IO2: login failure propagates from provider", async () => {
    const scope = createScope({ presets: [preset(authProvider, throwingAuth)] })
    const ctx = scope.createContext()
    await expect(
      ctx.exec({ flow: login, input: { email: "x@y.com", password: "wrong" } })
    ).rejects.toThrow("invalid credentials")
    await ctx.close({ ok: false, error: new Error("invalid credentials") })
    await scope.dispose()
  })
})
