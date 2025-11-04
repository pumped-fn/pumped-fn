import { multi, custom, Promised, flow } from '@pumped-fn/core-next'
import type { Todo, TenantMessage } from './types'
import { handleCreateTodo, handleUpdateTodo, handleDeleteTodo } from './flow.message-handler'

export const tenantActor = multi.provide(
  { keySchema: custom<string>() },
  (tenantId, controller) => {
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
        try {
          switch (message.type) {
            case 'CREATE_TODO': {
              const result = await flow.execute(handleCreateTodo, {
                id: message.payload.id,
                title: message.payload.title,
                currentTodos: state.todos
              })

              if (result.success) {
                state.todos.set(result.todo.id, result.todo)
              }
              break
            }

            case 'UPDATE_TODO': {
              const result = await flow.execute(handleUpdateTodo, {
                id: message.payload.id,
                title: message.payload.title,
                completed: message.payload.completed,
                currentTodos: state.todos
              })

              if (result.success) {
                state.todos.set(result.todo.id, result.todo)
              }
              break
            }

            case 'DELETE_TODO': {
              const result = await flow.execute(handleDeleteTodo, {
                id: message.payload.id,
                currentTodos: state.todos
              })

              if (result.success) {
                state.todos.delete(result.deletedId)
              }
              break
            }

            case 'GET_TODOS':
              break
          }
        } catch (error) {
          console.error(`[tenant-${tenantId}] Error processing message:`, error)
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
  }
)
