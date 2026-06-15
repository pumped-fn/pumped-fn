// @vitest-environment jsdom
import { describe, test, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { createScope, preset } from "@pumped-fn/lite"
import { ScopeProvider } from "@pumped-fn/lite-react"
import { bffClient, type BffClient, type DashboardView } from "../src/bff"
import { sessionToken } from "../src/session"
import { Dashboard } from "../src/Dashboard"

const fakeDash: DashboardView = {
  summary: { total: 5, healthy: 3, unhealthy: 1, unknown: 1, activeIncidents: 2 },
  attention: [
    { id: "s1", name: "api-gateway", status: "unhealthy", criticality: "critical" },
    { id: "s2", name: "cache", status: "unknown", criticality: "high" },
  ],
}

const fakeClient: BffClient = {
  login: async () => ({ token: "" }),
  dashboard: async () => fakeDash,
}

describe("outside-in", () => {
  test("OI1: shows loading when no token", async () => {
    const scope = createScope({ presets: [preset(bffClient, fakeClient)] })
    render(
      <ScopeProvider scope={scope}>
        <Dashboard />
      </ScopeProvider>
    )
    expect(await screen.findByText("loading")).toBeTruthy()
    await scope.dispose()
  })

  test("OI2: renders summary counts and attention rows when token present", async () => {
    const scope = createScope({
      presets: [preset(sessionToken, "tok-render"), preset(bffClient, fakeClient)],
    })
    render(
      <ScopeProvider scope={scope}>
        <Dashboard />
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
