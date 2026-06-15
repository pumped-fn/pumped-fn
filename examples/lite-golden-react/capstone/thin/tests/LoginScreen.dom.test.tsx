// @vitest-environment jsdom
import { describe, test, expect } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { createScope, preset } from "@pumped-fn/lite"
import { ScopeProvider } from "@pumped-fn/lite-react"
import { bffClient, type BffClient, type DashboardView } from "../src/bff"
import { sessionToken } from "../src/session"
import { LoginScreen } from "../src/LoginScreen"

const fakeDash: DashboardView = {
  summary: { total: 2, healthy: 1, unhealthy: 1, unknown: 0, activeIncidents: 0 },
  attention: [{ id: "s1", name: "api", status: "unhealthy", criticality: "high" }],
}

const successClient: BffClient = {
  login: async () => ({ token: "tok-dom" }),
  dashboard: async () => fakeDash,
}

const failingClient: BffClient = {
  login: async () => { throw new Error("bff /login failed: 401") },
  dashboard: async () => { throw new Error("not used") },
}

async function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText("email"), { target: { value: email } })
  fireEvent.change(screen.getByLabelText("password"), { target: { value: password } })
  fireEvent.click(screen.getByRole("button", { name: "sign in" }))
}

describe("outside-in", () => {
  test("OI1: renders sign-in form when no token", async () => {
    const scope = createScope({ presets: [preset(bffClient, successClient)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginScreen />
      </ScopeProvider>
    )
    expect(await screen.findByLabelText("email")).toBeTruthy()
    expect(screen.getByLabelText("password")).toBeTruthy()
    expect(screen.getByRole("button", { name: "sign in" })).toBeTruthy()
    await scope.dispose()
  })

  test("OI2: successful sign-in transitions to dashboard view", async () => {
    const scope = createScope({ presets: [preset(bffClient, successClient)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginScreen />
      </ScopeProvider>
    )
    await screen.findByLabelText("email")
    await fillAndSubmit("a@b.com", "pass")
    expect(await screen.findByLabelText("summary")).toBeTruthy()
    await scope.dispose()
  })

  test("OI3: failed sign-in shows error and stays on form", async () => {
    const scope = createScope({ presets: [preset(bffClient, failingClient)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginScreen />
      </ScopeProvider>
    )
    await screen.findByLabelText("email")
    await fillAndSubmit("x@y.com", "wrong")
    expect(await screen.findByRole("alert")).toBeTruthy()
    expect(screen.getByLabelText("email")).toBeTruthy()
    await scope.dispose()
  })

  test("OI4: non-Error thrown shows fallback 'login failed' message", async () => {
    const stringThrowClient: BffClient = {
      login: async () => { throw "oops" },
      dashboard: async () => { throw new Error("not used") },
    }
    const scope = createScope({ presets: [preset(bffClient, stringThrowClient)] })
    render(
      <ScopeProvider scope={scope}>
        <LoginScreen />
      </ScopeProvider>
    )
    await screen.findByLabelText("email")
    await fillAndSubmit("x@y.com", "wrong")
    const alert = await screen.findByRole("alert")
    expect(alert.textContent).toBe("login failed")
    await scope.dispose()
  })
})
