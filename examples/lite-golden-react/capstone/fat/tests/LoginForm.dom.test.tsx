// @vitest-environment jsdom
import { describe, test, expect } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { createScope, preset } from "@pumped-fn/lite"
import { ScopeProvider } from "@pumped-fn/lite-react"
import { authProvider, type AuthProvider, type Session } from "../src/auth"
import { LoginForm } from "../src/LoginForm"

const aSession: Session = { token: "tok-1", user: { id: "u1", name: "Alice" } }

const successAuth: AuthProvider = { authenticate: async () => aSession }
const failingAuth: AuthProvider = {
  authenticate: async () => {
    throw new Error("invalid credentials")
  },
}

async function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("email"), { target: { value: email } })
  fireEvent.change(screen.getByLabelText("password"), { target: { value: password } })
  fireEvent.click(screen.getByRole("button", { name: "login" }))
}

describe("outside-in", () => {
  test("OI1: renders email and password inputs when not authed", async () => {
    const scope = createScope({ presets: [preset(authProvider, successAuth)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginForm />
      </ScopeProvider>
    )
    expect(await screen.findByLabelText("email")).toBeTruthy()
    expect(screen.getByLabelText("password")).toBeTruthy()
    expect(screen.getByRole("button", { name: "login" })).toBeTruthy()
    await scope.dispose()
  })

  test("OI2: successful login transitions to authed state (logout button appears)", async () => {
    const scope = createScope({ presets: [preset(authProvider, successAuth)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginForm />
      </ScopeProvider>
    )
    await screen.findByLabelText("email")
    await fillAndSubmit("a@b.com", "pass")
    expect(await screen.findByRole("button", { name: "logout" })).toBeTruthy()
    await scope.dispose()
  })

  test("OI3: clicking logout returns to login form", async () => {
    const scope = createScope({ presets: [preset(authProvider, successAuth)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginForm />
      </ScopeProvider>
    )
    await screen.findByLabelText("email")
    await fillAndSubmit("a@b.com", "pass")
    const logoutBtn = await screen.findByRole("button", { name: "logout" })
    fireEvent.click(logoutBtn)
    expect(await screen.findByLabelText("email")).toBeTruthy()
    await scope.dispose()
  })

  test("OI4: failed login shows error message and stays on form (spec OI3)", async () => {
    const scope = createScope({ presets: [preset(authProvider, failingAuth)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginForm />
      </ScopeProvider>
    )
    await screen.findByLabelText("email")
    await fillAndSubmit("x@y.com", "wrong")
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByLabelText("email")).toBeTruthy()
    await scope.dispose()
  })

  test("OI5: non-Error thrown by auth shows fallback 'login failed' message", async () => {
    const stringThrowAuth: AuthProvider = { authenticate: async () => { throw "oops" } }
    const scope = createScope({ presets: [preset(authProvider, stringThrowAuth)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginForm />
      </ScopeProvider>
    )
    await screen.findByLabelText("email")
    await fillAndSubmit("x@y.com", "wrong")
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("login failed")
    await scope.dispose()
  })
})
