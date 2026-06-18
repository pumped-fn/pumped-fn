import { describe, test, expect } from "vitest"
import { createScope, preset } from "@pumped-fn/lite"
import { bffClient, type BffClient } from "../src/bff"
import { signInForm, updateSignInEmail, updateSignInPassword, submitSignIn, signIn } from "../src/signIn"
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

  test("IO3: sign-in form field flows store credentials in graph state", async () => {
    const scope = createScope({ presets: [preset(bffClient, fakeClient)] })
    const ctx = scope.createContext()
    await ctx.exec({ flow: updateSignInEmail, input: "a@b.com" })
    await ctx.exec({ flow: updateSignInPassword, input: "pass" })
    await ctx.close({ ok: true })
    expect(await scope.resolve(signInForm)).toEqual({ email: "a@b.com", password: "pass", error: null })
    await scope.dispose()
  })

  test("IO4: submitSignIn reads graph credentials, clears errors, and stores token", async () => {
    const scope = createScope({ presets: [preset(bffClient, fakeClient)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateSignInEmail, input: "a@b.com" })
    await formCtx.exec({ flow: updateSignInPassword, input: "pass" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await submitCtx.exec({ flow: submitSignIn, input: undefined })
    await submitCtx.close({ ok: true })
    expect(await scope.resolve(sessionToken)).toBe("tok-abc")
    expect(await scope.resolve(signInForm)).toEqual({ email: "a@b.com", password: "pass", error: null })
    await scope.dispose()
  })

  test("IO5: submitSignIn rejects invalid email before BFF auth and records the graph error", async () => {
    let calls = 0
    const client: BffClient = {
      login: async () => {
        calls += 1
        return { token: "tok-abc" }
      },
      dashboard: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(bffClient, client)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateSignInEmail, input: "invalid" })
    await formCtx.exec({ flow: updateSignInPassword, input: "pass" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitSignIn, input: undefined })).rejects.toThrow("email must include @")
    await submitCtx.close({ ok: false, error: new Error("email must include @") })
    expect(calls).toBe(0)
    expect(await scope.resolve(sessionToken)).toBeNull()
    expect(await scope.resolve(signInForm)).toEqual({
      email: "invalid",
      password: "pass",
      error: "email must include @",
    })
    await scope.dispose()
  })

  test("IO6: submitSignIn rejects empty password before BFF auth and records the graph error", async () => {
    let calls = 0
    const client: BffClient = {
      login: async () => {
        calls += 1
        return { token: "tok-abc" }
      },
      dashboard: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(bffClient, client)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateSignInEmail, input: "a@b.com" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitSignIn, input: undefined })).rejects.toThrow("password is required")
    await submitCtx.close({ ok: false, error: new Error("password is required") })
    expect(calls).toBe(0)
    expect(await scope.resolve(sessionToken)).toBeNull()
    expect(await scope.resolve(signInForm)).toEqual({
      email: "a@b.com",
      password: "",
      error: "password is required",
    })
    await scope.dispose()
  })

  test("IO7: submitSignIn failure normalizes graph error and keeps token null", async () => {
    const scope = createScope({ presets: [preset(bffClient, throwingClient)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateSignInEmail, input: "x@y.com" })
    await formCtx.exec({ flow: updateSignInPassword, input: "wrong" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitSignIn, input: undefined })).rejects.toThrow("bff /login failed: 401")
    await submitCtx.close({ ok: false, error: new Error("bff /login failed: 401") })
    expect(await scope.resolve(sessionToken)).toBeNull()
    expect(await scope.resolve(signInForm)).toEqual({
      email: "x@y.com",
      password: "wrong",
      error: "bff /login failed: 401",
    })
    await scope.dispose()
  })

  test("IO8: submitSignIn normalizes non-Error failures", async () => {
    const stringThrowClient: BffClient = {
      login: async () => {
        throw "oops"
      },
      dashboard: async () => {
        throw new Error("not used")
      },
    }
    const scope = createScope({ presets: [preset(bffClient, stringThrowClient)] })
    const formCtx = scope.createContext()
    await formCtx.exec({ flow: updateSignInEmail, input: "x@y.com" })
    await formCtx.exec({ flow: updateSignInPassword, input: "wrong" })
    await formCtx.close({ ok: true })

    const submitCtx = scope.createContext()
    await expect(submitCtx.exec({ flow: submitSignIn, input: undefined })).rejects.toBe("oops")
    await submitCtx.close({ ok: false, error: "oops" })
    expect(await scope.resolve(signInForm)).toEqual({
      email: "x@y.com",
      password: "wrong",
      error: "login failed",
    })
    await scope.dispose()
  })
})
