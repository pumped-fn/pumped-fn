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
    const validation = await ctx.exec({
      fn: () => {
        if (!input.title || input.title.trim() === '') {
          return { ok: false as const, reason: 'EMPTY_TITLE' as const }
        }

        if (input.currentTodos.has(input.id)) {
          return { ok: false as const, reason: 'DUPLICATE_ID' as const }
        }

        return { ok: true as const }
      },
      key: 'validate-input'
    })

    if (!validation.ok) {
      return { success: false, reason: validation.reason }
    }

    const todo = await ctx.exec({
      fn: () => {
        const item: Todo.Item = {
          id: input.id,
          title: input.title.trim(),
          completed: false,
          createdAt: Date.now()
        }
        return item
      },
      key: 'create-todo'
    })

    return { success: true, todo }
  }
)

export namespace HandleUpdateTodo {
  export type Input = {
    id: string
    title?: string
    completed?: boolean
    currentTodos: Map<string, Todo.Item>
  }

  export type Success = { success: true; todo: Todo.Item }
  export type Error = { success: false; reason: 'TODO_NOT_FOUND' }

  export type Result = Success | Error
}

export const handleUpdateTodo = flow(
  async (ctx, input: HandleUpdateTodo.Input): Promise<HandleUpdateTodo.Result> => {
    const existing = await ctx.exec({
      fn: () => {
        return input.currentTodos.get(input.id)
      },
      key: 'find-todo'
    })

    if (!existing) {
      return { success: false, reason: 'TODO_NOT_FOUND' }
    }

    const updated = await ctx.exec({
      fn: () => {
        const item: Todo.Item = {
          ...existing,
          title: input.title ?? existing.title,
          completed: input.completed ?? existing.completed
        }
        return item
      },
      key: 'update-todo'
    })

    return { success: true, todo: updated }
  }
)

export namespace HandleDeleteTodo {
  export type Input = {
    id: string
    currentTodos: Map<string, Todo.Item>
  }

  export type Success = { success: true; deletedId: string }
  export type Error = { success: false; reason: 'TODO_NOT_FOUND' }

  export type Result = Success | Error
}

export const handleDeleteTodo = flow(
  async (ctx, input: HandleDeleteTodo.Input): Promise<HandleDeleteTodo.Result> => {
    const exists = await ctx.exec({
      fn: () => {
        return input.currentTodos.has(input.id)
      },
      key: 'check-exists'
    })

    if (!exists) {
      return { success: false, reason: 'TODO_NOT_FOUND' }
    }

    return { success: true, deletedId: input.id }
  }
)
