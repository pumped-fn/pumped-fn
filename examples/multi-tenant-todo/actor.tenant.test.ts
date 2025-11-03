import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { createTenantActor } from './actor.tenant'
import type { Todo } from './types'

describe('Tenant Actor', () => {
  test('creates tenant actor with initial state', async () => {
    const scope = createScope()

    const actor = await scope.resolve(createTenantActor('tenant-1'))
    const state = actor.getState()

    expect(state.tenantId).toBe('tenant-1')
    expect(state.todos.size).toBe(0)

    await scope.dispose()
  })
})
