import { createScope, type Lite } from "@pumped-fn/lite"
import { ExecutionContextProvider, ScopeProvider } from "@pumped-fn/lite-react"
import { createRoot } from "react-dom/client"
import { CounterApp } from "./view"

export interface MountedCounterApp {
  scope: Lite.Scope
  unmount(): Promise<void>
}

export function mountCounterApp(container: Element): MountedCounterApp {
  const scope = createScope()
  const root = createRoot(container)

  root.render(
    <ScopeProvider scope={scope}>
      <ExecutionContextProvider>
        <CounterApp />
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

export function mountMain(): MountedCounterApp {
  const container = document.getElementById("root")
  if (container === null) throw new Error("root container missing")
  return mountCounterApp(container)
}
