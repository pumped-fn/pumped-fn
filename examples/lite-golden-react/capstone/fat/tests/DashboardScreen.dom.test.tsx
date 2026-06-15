// @vitest-environment jsdom
import { describe, test, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { createScope, preset } from "@pumped-fn/lite"
import { ScopeProvider } from "@pumped-fn/lite-react"
import { authProvider, session, type AuthProvider, type Session } from "../src/auth"
import { bffClient, type BffClient, type DashboardView } from "../src/app"
import { DashboardScreen } from "../src/DashboardScreen"

const aSession: Session = { token: "tok-1", user: { id: "u1", name: "Alice" } }

const stubAuth: AuthProvider = { authenticate: async () => aSession }

const fakeDashboard: DashboardView = {
  summary: { total: 5, healthy: 3, unhealthy: 1, unknown: 1, activeIncidents: 2 },
  attention: [
    { id: "s1", name: "api-gateway", status: "unhealthy", criticality: "critical" },
    { id: "s2", name: "cache", status: "unknown", criticality: "high" },
  ],
}

const fakeClient: BffClient = { dashboard: async () => fakeDashboard }

describe("outside-in", () => {
  test("OI1: not authed — login form visible", async () => {
    const scope = createScope({ presets: [preset(authProvider, stubAuth)] })
    render(
      <ScopeProvider scope={scope}>
        <DashboardScreen />
      </ScopeProvider>
    )
    expect(await screen.findByLabelText("email")).toBeTruthy()
    await scope.dispose()
  })

  test("OI2: authed + dashboard loaded — summary counts and attention rows render", async () => {
    const scope = createScope({
      presets: [preset(session, aSession), preset(bffClient, fakeClient)],
    })
    render(
      <ScopeProvider scope={scope}>
        <DashboardScreen />
      </ScopeProvider>
    )
    expect(await screen.findByText(/total.*5/i)).toBeTruthy()
    expect(screen.getByText(/healthy.*3/i)).toBeTruthy()
    expect(screen.getByText(/unhealthy.*1/i)).toBeTruthy()
    expect(screen.getByText(/unknown.*1/i)).toBeTruthy()
    expect(screen.getByText(/incidents.*2/i)).toBeTruthy()
    expect(screen.getByText("api-gateway")).toBeTruthy()
    expect(screen.getByText("cache")).toBeTruthy()
    await scope.dispose()
  })
})
