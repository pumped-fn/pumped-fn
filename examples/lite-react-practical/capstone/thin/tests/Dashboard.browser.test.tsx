import { describe, test, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { createScope, preset } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { authedBffClient, type AuthedBffClient, type DashboardView } from "../src/bff"
import { Dashboard } from "../src/Dashboard"

const fakeDash: DashboardView = {
  summary: { total: 5, healthy: 3, unhealthy: 1, unknown: 1, activeIncidents: 2 },
  attention: [
    { id: "s1", name: "api-gateway", status: "unhealthy", criticality: "critical" },
    { id: "s2", name: "cache", status: "unknown", criticality: "high" },
  ],
}

const fakeClient: AuthedBffClient = {
  dashboard: async () => fakeDash,
}

describe("outside-in", () => {
  test("OI1: shows loading when no token", async () => {
    const scope = createScope({ presets: [preset(authedBffClient, null)] })
    render(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider>
          <Dashboard />
        </ExecutionContextProvider>
      </ScopeProvider>
    )
    expect(await screen.findByText("loading")).toBeTruthy()
    await scope.dispose()
  })

  test("OI2: renders summary counts and attention rows when token present", async () => {
    const scope = createScope({
      presets: [preset(authedBffClient, fakeClient)],
    })
    render(
      <ScopeProvider scope={scope}>
        <ExecutionContextProvider>
          <Dashboard />
        </ExecutionContextProvider>
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
