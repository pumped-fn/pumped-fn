import { flow } from '@pumped-fn/core-next'
import type { Todo } from './types'

export namespace HandleCreateTodo {
  export type Input = {
    id: string
    title: string
    currentTodos: Map<string, Todo.Item>
  }

  export type Success = { success: true; todo: Todo.Item }
  export type Error =
    | { success: false; reason: 'EMPTY_TITLE' }
    | { success: false; reason: 'DUPLICATE_ID' }

  export type Result = Success | Error
}

export const handleCreateTodo = flow(
  async (ctx, input: HandleCreateTodo.Input): Promise<HandleCreateTodo.Result> => {
    const validation = await ctx.run('validate-input', () => {
      if (!input.title || input.title.trim() === '') {
        return { ok: false as const, reason: 'EMPTY_TITLE' as const }
      }

      if (input.currentTodos.has(input.id)) {
        return { ok: false as const, reason: 'DUPLICATE_ID' as const }
      }

      return { ok: true as const }
    })

    if (!validation.ok) {
      return { success: false, reason: validation.reason }
    }

    const todo = await ctx.run('create-todo', () => {
      const item: Todo.Item = {
        id: input.id,
        title: input.title.trim(),
        completed: false,
        createdAt: Date.now()
      }
      return item
    })

    return { success: true, todo }
  }
)
