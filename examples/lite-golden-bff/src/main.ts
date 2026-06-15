import { createScope, type Lite } from "@pumped-fn/lite"
import { type BffRequest, handleBffRequest } from "./http"

export interface MountedBff {
  scope: Lite.Scope
  handle(request: BffRequest): ReturnType<typeof handleBffRequest>
  dispose(): Promise<void>
}

export function mountBff(options?: Lite.ScopeOptions): MountedBff {
  const scope = createScope(options)
  return {
    scope,
    handle: (request) => handleBffRequest(scope, request),
    dispose: () => scope.dispose(),
  }
}

export function mountMain(): MountedBff {
  return mountBff()
}
