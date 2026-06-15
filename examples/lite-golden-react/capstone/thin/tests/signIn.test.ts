import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { bffClient, type BffClient } from "../src/bff"
import { signIn } from "../src/signIn"
import { sessionToken } from "../src/session"

const fakeClient: BffClient = {
  login: async (_email, _password) => ({ token: "tok-abc" }),
  dashboard: async () => { throw new Error("not used") },
}

const throwingClient: BffClient = {
  login: async () => { throw new Error("bff /login failed: 401") },
  dashboard: async () => { throw new Error("not used") },
}

describe("inside-out", () => {
  test("IO1: signIn stores the token on success", async () => {
    const scope = createScope({ presets: [preset(bffClient, fakeClient)] })
    const ctx = scope.createContext()
    await ctx.exec({ flow: signIn, input: { email: "a@b.com", password: "pass" } })
    await ctx.close({ ok: true })
    const token = await scope.resolve(sessionToken)
    expect(token).toBe("tok-abc")
    await scope.dispose()
  })

  test("IO2: signIn failure propagates and token stays null", async () => {
    const scope = createScope({ presets: [preset(bffClient, throwingClient)] })
    const ctx = scope.createContext()
    await expect(
      ctx.exec({ flow: signIn, input: { email: "x@y.com", password: "wrong" } })
    ).rejects.toThrow()
    await ctx.close({ ok: false, error: new Error("failed") })
    const token = await scope.resolve(sessionToken)
    expect(token).toBeNull()
    await scope.dispose()
  })
})
