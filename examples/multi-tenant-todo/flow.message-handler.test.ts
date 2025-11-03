import { describe, test, expect } from 'vitest'
import { flow } from '@pumped-fn/core-next'
import { handleCreateTodo } from './flow.message-handler'

describe('Message Handler Flows', () => {
  test('handleCreateTodo validates and creates todo', async () => {
    const result = await flow.execute(handleCreateTodo, {
      id: 'todo-1',
      title: 'Write tests',
      currentTodos: new Map()
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.todo.id).toBe('todo-1')
      expect(result.todo.title).toBe('Write tests')
      expect(result.todo.completed).toBe(false)
    }
  })

  test('handleCreateTodo rejects empty title', async () => {
    const result = await flow.execute(handleCreateTodo, {
      id: 'todo-1',
      title: '',
      currentTodos: new Map()
    })

    expect(result).toEqual({
      success: false,
      reason: 'EMPTY_TITLE'
    })
  })

  test('handleCreateTodo rejects duplicate id', async () => {
    const existingTodos = new Map([
      ['todo-1', {
        id: 'todo-1',
        title: 'Existing',
        completed: false,
        createdAt: Date.now()
      }]
    ])

    const result = await flow.execute(handleCreateTodo, {
      id: 'todo-1',
      title: 'New todo',
      currentTodos: existingTodos
    })

    expect(result).toEqual({
      success: false,
      reason: 'DUPLICATE_ID'
    })
  })
})
