import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import {
  authProvider,
  session,
  loginForm,
  updateLoginEmail,
  updateLoginPassword,
  submitLogin,
  login,
  isAuthed,
  logout,
  type AuthProvider,
  type Session,
} from "../src/auth"

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

  test("IO4: login form field flows store credentials in graph state", async () => {
    const scope = createScope({ presets: [preset(authProvider, fakeAuth)] })
    const ctx = scope.createContext()
    await ctx.exec({ flow: updateLoginEmail, input: "a@b.com" })
    await ctx.exec({ flow: updateLoginPassword, input: "pass" })
    await ctx.close({ ok: true })
    expect(await scope.resolve(loginForm)).toEqual({ email: "a@b.com", password: "pass", error: null })
    await scope.dispose()
  })

  test("IO5: submitLogin reads graph credentials, clears errors, and sets session", async () => {
    const scope = createScope({ presets: [preset(authProvider, fakeAuth)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateLoginEmail, input: "a@b.com" })
    await formCtx.exec({ flow: updateLoginPassword, input: "pass" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await submitCtx.exec({ flow: submitLogin, input: undefined })
    await submitCtx.close({ ok: true })
    expect(await scope.resolve(session)).toEqual(aSession)
    expect(await scope.resolve(loginForm)).toEqual({ email: "a@b.com", password: "pass", error: null })
    await scope.dispose()
  })

  test("IO6: submitLogin rejects invalid email before auth and records the graph error", async () => {
    let calls = 0
    const auth: AuthProvider = {
      authenticate: async () => {
        calls += 1
        return aSession
      },
    }
    const scope = createScope({ presets: [preset(authProvider, auth)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateLoginEmail, input: "invalid" })
    await formCtx.exec({ flow: updateLoginPassword, input: "pass" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitLogin, input: undefined })).rejects.toThrow("email must include @")
    await submitCtx.close({ ok: false, error: new Error("email must include @") })
    expect(calls).toBe(0)
    expect(await scope.resolve(session)).toBeNull()
    expect(await scope.resolve(loginForm)).toEqual({
      email: "invalid",
      password: "pass",
      error: "email must include @",
    })
    await scope.dispose()
  })

  test("IO7: submitLogin rejects empty password before auth and records the graph error", async () => {
    let calls = 0
    const auth: AuthProvider = {
      authenticate: async () => {
        calls += 1
        return aSession
      },
    }
    const scope = createScope({ presets: [preset(authProvider, auth)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateLoginEmail, input: "a@b.com" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitLogin, input: undefined })).rejects.toThrow("password is required")
    await submitCtx.close({ ok: false, error: new Error("password is required") })
    expect(calls).toBe(0)
    expect(await scope.resolve(session)).toBeNull()
    expect(await scope.resolve(loginForm)).toEqual({
      email: "a@b.com",
      password: "",
      error: "password is required",
    })
    await scope.dispose()
  })

  test("IO8: submitLogin failure normalizes graph error and keeps session null", async () => {
    const scope = createScope({ presets: [preset(authProvider, throwingAuth)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateLoginEmail, input: "x@y.com" })
    await formCtx.exec({ flow: updateLoginPassword, input: "wrong" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitLogin, input: undefined })).rejects.toThrow("invalid credentials")
    await submitCtx.close({ ok: false, error: new Error("invalid credentials") })
    expect(await scope.resolve(session)).toBeNull()
    expect(await scope.resolve(loginForm)).toEqual({
      email: "x@y.com",
      password: "wrong",
      error: "invalid credentials",
    })
    await scope.dispose()
  })

  test("IO9: submitLogin normalizes non-Error failures", async () => {
    const stringThrowAuth: AuthProvider = {
      authenticate: async () => {
        throw "oops"
      },
    }
    const scope = createScope({ presets: [preset(authProvider, stringThrowAuth)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateLoginEmail, input: "x@y.com" })
    await formCtx.exec({ flow: updateLoginPassword, input: "wrong" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitLogin, input: undefined })).rejects.toBe("oops")
    await submitCtx.close({ ok: false, error: "oops" })
    expect(await scope.resolve(loginForm)).toEqual({
      email: "x@y.com",
      password: "wrong",
      error: "login failed",
    })
    await scope.dispose()
  })

  test("IO10: logout resets session to null", async () => {
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
