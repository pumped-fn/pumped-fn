import { provide, Promised } from '@pumped-fn/core-next'
import type { Todo, TenantMessage } from './types'

export const createTenantActor = (tenantId: string) => {
  return provide((controller) => {
    const state: Todo.State = {
      tenantId,
      todos: new Map()
    }

    const messageQueue: TenantMessage.Message[] = []
    let processing = false

    const processNextMessage = async (): Promise<void> => {
      if (processing || messageQueue.length === 0) return

      processing = true
      const message = messageQueue.shift()

      if (message) {
        switch (message.type) {
          case 'CREATE_TODO': {
            const todo: Todo.Item = {
              id: message.payload.id,
              title: message.payload.title,
              completed: false,
              createdAt: Date.now()
            }
            state.todos.set(todo.id, todo)
            break
          }

          case 'UPDATE_TODO': {
            const existing = state.todos.get(message.payload.id)
            if (existing) {
              const updated: Todo.Item = {
                ...existing,
                title: message.payload.title ?? existing.title,
                completed: message.payload.completed ?? existing.completed
              }
              state.todos.set(message.payload.id, updated)
            }
            break
          }

          case 'DELETE_TODO': {
            state.todos.delete(message.payload.id)
            break
          }

          case 'GET_TODOS':
            break
        }
      }

      processing = false

      if (messageQueue.length > 0) {
        setImmediate(() => processNextMessage())
      }
    }

    controller.cleanup(() =>
      Promised.try(async () => {
        while (messageQueue.length > 0) {
          await processNextMessage()
        }
      })
    )

    return {
      send: (message: TenantMessage.Message) => {
        messageQueue.push(message)
        processNextMessage()
      },

      getState: () => state,

      getTodos: () => Array.from(state.todos.values())
    }
  })
}
