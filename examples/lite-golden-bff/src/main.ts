import { createScope, type Lite } from "@pumped-fn/lite"
import { type BffRequest, type BffResult, handleBffRequest } from "./http"

export interface MountedBff {
  scope: Lite.Scope
  handle(request: BffRequest): Promise<BffResult>
  dispose(): Promise<void>
}

export function mountBff(options?: Lite.ScopeOptions): MountedBff {
  const scope = createScope(options)
  const ctx = scope.createContext()
  return {
    scope,
    handle: (request) => ctx.exec({ flow: handleBffRequest, input: request }),
    dispose: async () => {
      await ctx.close({ ok: true })
      await scope.dispose()
    },
  }
}

export function mountMain(): MountedBff {
  return mountBff()
}
