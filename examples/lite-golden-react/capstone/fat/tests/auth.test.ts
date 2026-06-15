import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { authProvider, session, login, isAuthed, logout, type AuthProvider, type Session } from "../src/auth"

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
  test("IO1: login flow sets session via preset authProvider", async () => {
    const scope = createScope({ presets: [preset(authProvider, fakeAuth)] })
    const ctx = scope.createContext()
    await ctx.exec({ flow: login, input: { email: "a@b.com", password: "pass" } })
    await ctx.close({ ok: true })
    const s = await scope.resolve(session)
    expect(s).toEqual(aSession)
    await scope.dispose()
  })

  test("IO2: isAuthed is false before login and true after", async () => {
    const scope = createScope({ presets: [preset(authProvider, fakeAuth)] })
    expect(await scope.resolve(isAuthed)).toBe(false)
    const ctx = scope.createContext()
    await ctx.exec({ flow: login, input: { email: "a@b.com", password: "pass" } })
    await ctx.close({ ok: true })
    await scope.flush()
    expect(await scope.resolve(isAuthed)).toBe(true)
    await scope.dispose()
  })

  test("IO3: login failure propagates and session stays null", async () => {
    const scope = createScope({ presets: [preset(authProvider, throwingAuth)] })
    const ctx = scope.createContext()
    await expect(
      ctx.exec({ flow: login, input: { email: "x@y.com", password: "wrong" } })
    ).rejects.toThrow("invalid credentials")
    await ctx.close({ ok: false, error: new Error("invalid credentials") })
    expect(await scope.resolve(session)).toBeNull()
    await scope.dispose()
  })

  test("IO4: logout resets session to null", async () => {
    const scope = createScope({ presets: [preset(authProvider, fakeAuth)] })
    const loginCtx = scope.createContext()
    await loginCtx.exec({ flow: login, input: { email: "a@b.com", password: "pass" } })
    await loginCtx.close({ ok: true })
    await scope.flush()
    expect(await scope.resolve(isAuthed)).toBe(true)

    const logoutCtx = scope.createContext()
    await logoutCtx.exec({ flow: logout, input: undefined })
    await logoutCtx.close({ ok: true })
    await scope.flush()
    expect(await scope.resolve(session)).toBeNull()
    expect(await scope.resolve(isAuthed)).toBe(false)
    await scope.dispose()
  })
})
