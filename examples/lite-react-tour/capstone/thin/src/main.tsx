import { createScope, type Lite } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { createRoot } from "react-dom/client"
import { LoginScreen } from "./LoginScreen"

export interface MountedThinDashboard {
  scope: Lite.Scope
  unmount(): Promise<void>
}

export function mountThinDashboard(container: Element): MountedThinDashboard {
  const scope = createScope()
  const root = createRoot(container)

  root.render(
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <LoginScreen />
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

export function mountMain(): MountedThinDashboard {
  const container = document.getElementById("root")
  if (container === null) throw new Error("root container missing")
  return mountThinDashboard(container)
}
