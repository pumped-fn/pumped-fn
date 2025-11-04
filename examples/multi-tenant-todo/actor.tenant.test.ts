import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { createTenantActor } from './actor.tenant'
import type { Todo } from './types'

const waitForCondition = async (
  condition: () => boolean,
  timeoutMs = 1000,
  intervalMs = 10
): Promise<void> => {
  const startTime = Date.now()
  while (!condition()) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('waitForCondition timeout')
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs))
  }
}

describe('Tenant Actor', () => {
  test('creates tenant actor with initial state', async () => {
    const scope = createScope()

    const actor = await scope.resolve(createTenantActor('tenant-1'))
    const state = actor.getState()

    expect(state.tenantId, 'tenant ID should match').toBe('tenant-1')
    expect(state.todos.size, 'initial todos map should be empty').toBe(0)

    await scope.dispose()
  })

  test('processes CREATE_TODO message', async () => {
    const scope = createScope()
    const actor = await scope.resolve(createTenantActor('tenant-1'))

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Write tests' }
    })

    await waitForCondition(() => actor.getTodos().length === 1)

    const todos = actor.getTodos()
    expect(todos, 'should have exactly 1 todo after CREATE_TODO').toHaveLength(1)
    expect(todos[0], 'created todo should match expected properties').toMatchObject({
      id: 'todo-1',
      title: 'Write tests',
      completed: false
    })

    await scope.dispose()
  })

  test('processes UPDATE_TODO message', async () => {
    const scope = createScope()
    const actor = await scope.resolve(createTenantActor('tenant-1'))

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Write tests' }
    })

    await waitForCondition(() => actor.getTodos().length === 1)

    actor.send({
      type: 'UPDATE_TODO',
      payload: { id: 'todo-1', completed: true }
    })

    await waitForCondition(() => {
      const todos = actor.getTodos()
      return todos.length > 0 && todos[0].completed === true
    })

    const todos = actor.getTodos()
    expect(todos, 'should have exactly 1 todo').toHaveLength(1)
    expect(todos[0].completed, 'todo should be marked as completed').toBe(true)
    expect(todos[0].title, 'todo title should remain unchanged').toBe('Write tests')

    await scope.dispose()
  })

  test('processes DELETE_TODO message', async () => {
    const scope = createScope()
    const actor = await scope.resolve(createTenantActor('tenant-1'))

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Write tests' }
    })

    await waitForCondition(() => actor.getTodos().length === 1)

    actor.send({
      type: 'DELETE_TODO',
      payload: { id: 'todo-1' }
    })

    await waitForCondition(() => actor.getTodos().length === 0)

    const todos = actor.getTodos()
    expect(todos, 'todos should be empty after DELETE_TODO').toHaveLength(0)

    await scope.dispose()
  })
})
