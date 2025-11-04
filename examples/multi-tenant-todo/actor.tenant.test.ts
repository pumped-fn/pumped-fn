import { describe, test, expect } from 'vitest'
import { createScope } from '@pumped-fn/core-next'
import { tenantActor } from './actor.tenant'
import { waitForProcessing, waitForCondition } from './test-utils'
import type { Todo } from './types'

describe('Tenant Actor', () => {
  test('creates tenant actor with initial state', async () => {
    const scope = createScope()

    const actor = await scope.resolve(tenantActor('tenant-1'))
    const state = actor.getState()

    expect(state.tenantId).toBe('tenant-1')
    expect(state.todos.size).toBe(0)

    await scope.dispose()
  })

  test('processes CREATE_TODO message', async () => {
    const scope = createScope()
    const actor = await scope.resolve(tenantActor('tenant-1'))

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Write tests' }
    })

    await waitForProcessing(actor, 1)

    const todos = actor.getTodos()
    expect(todos).toHaveLength(1)
    expect(todos[0]).toMatchObject({
      id: 'todo-1',
      title: 'Write tests',
      completed: false
    })

    await scope.dispose()
  })

  test('processes UPDATE_TODO message', async () => {
    const scope = createScope()
    const actor = await scope.resolve(tenantActor('tenant-1'))

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Write tests' }
    })

    await waitForProcessing(actor, 1)

    actor.send({
      type: 'UPDATE_TODO',
      payload: { id: 'todo-1', completed: true }
    })

    await waitForCondition(() => {
      const todos = actor.getTodos()
      return todos.length === 1 && todos[0].completed === true
    })

    const todos = actor.getTodos()
    expect(todos[0].completed).toBe(true)
    expect(todos[0].title).toBe('Write tests')

    await scope.dispose()
  })

  test('processes DELETE_TODO message', async () => {
    const scope = createScope()
    const actor = await scope.resolve(tenantActor('tenant-1'))

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Write tests' }
    })

    await waitForProcessing(actor, 1)

    actor.send({
      type: 'DELETE_TODO',
      payload: { id: 'todo-1' }
    })

    await waitForProcessing(actor, 0)

    const todos = actor.getTodos()
    expect(todos).toHaveLength(0)

    await scope.dispose()
  })

  test('actor uses flow handlers for message processing', async () => {
    const scope = createScope()
    const actor = await scope.resolve(tenantActor('tenant-1'))

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Test' }
    })

    await waitForProcessing(actor, 1)

    actor.send({
      type: 'CREATE_TODO',
      payload: { id: 'todo-1', title: 'Duplicate' }
    })

    await waitForProcessing(actor, 1)

    const todos = actor.getTodos()
    expect(todos).toHaveLength(1)
    expect(todos[0].title).toBe('Test')

    await scope.dispose()
  })
})
