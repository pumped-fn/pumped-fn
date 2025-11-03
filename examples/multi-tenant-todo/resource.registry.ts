import { provide, createScope, Promised } from '@pumped-fn/core-next'
import { createTenantActor } from './actor.tenant'

export type TenantActor = {
  send: (message: import('./types').TenantMessage.Message) => void
  getState: () => import('./types').Todo.State
  getTodos: () => import('./types').Todo.Item[]
}

export const actorRegistry = provide((controller) => {
  const actors = new Map<string, TenantActor>()
  const scopes = new Map<string, Awaited<ReturnType<typeof createScope>>>()

  controller.cleanup(() =>
    Promised.try(async () => {
      for (const [_id, scope] of scopes) {
        await scope.dispose()
      }
      actors.clear()
      scopes.clear()
    })
  )

  return {
    spawn: async (tenantId: string): Promise<TenantActor> => {
      if (actors.has(tenantId)) {
        return actors.get(tenantId)!
      }

      const scope = createScope()
      scopes.set(tenantId, scope)

      const actor = await scope.resolve(createTenantActor(tenantId))
      actors.set(tenantId, actor)

      return actor
    },

    get: (tenantId: string): TenantActor | undefined => {
      return actors.get(tenantId)
    },

    list: (): string[] => {
      return Array.from(actors.keys())
    },

    kill: async (tenantId: string): Promise<void> => {
      const scope = scopes.get(tenantId)
      if (scope) {
        await scope.dispose()
        scopes.delete(tenantId)
      }
      actors.delete(tenantId)
    }
  }
})
