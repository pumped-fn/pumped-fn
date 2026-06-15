import { createScope, type Lite } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { createRoot } from "react-dom/client"
import { DashboardScreen } from "./DashboardScreen"

export interface MountedFatDashboard {
  scope: Lite.Scope
  unmount(): Promise<void>
}

export function mountFatDashboard(container: Element): MountedFatDashboard {
  const scope = createScope()
  const root = createRoot(container)

  root.render(
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <DashboardScreen />
      </ExecutionContextProvider>
    </ScopeProvider>
  )

  return {
    scope,
    unmount: async () => {
      root.unmount()
      await scope.dispose()
    },
  }
}

export function mountMain(): MountedFatDashboard {
  const container = document.getElementById("root")
  if (container === null) throw new Error("root container missing")
  return mountFatDashboard(container)
}
