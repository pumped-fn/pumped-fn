import { atom, flow, tag, tags } from "@pumped-fn/lite"
import { z } from "zod"

export type TodoStatus = "open" | "done"

export interface Todo {
  id: string
  tenantId: string
  title: string
  status: TodoStatus
  createdBy: string
  updatedBy: string
  lastRequestId: string
  lastOperation: string
}

const createTodoInput = z.object({
  title: z.string({ error: "title is required" }).trim().min(1, "title is required"),
})

const toggleTodoInput = z.object({
  id: z.string({ error: "id is required" }).min(1, "id is required"),
})

export type CreateTodoInput = z.infer<typeof createTodoInput>

export type ToggleTodoInput = z.infer<typeof toggleTodoInput>

interface MutationInput {
  tenantId: string
  actorId: string
  requestId: string
  operation: string
}

interface StoreCreateInput extends MutationInput {
  title: string
}

interface StoreToggleInput extends MutationInput {
  id: string
}

export interface TodoStore {
  list(tenantId: string): Promise<Todo[]>
  create(input: StoreCreateInput): Promise<Todo>
  toggle(input: StoreToggleInput): Promise<Todo>
  clearCompleted(input: MutationInput): Promise<Todo[]>
}

export class TodoNotFound extends Error {
  constructor(id: string) {
    super(`todo not found: ${id}`)
    this.name = "TodoNotFound"
  }
}

export const requestId = tag<string>({ label: "todo.request.id" })
export const tenantId = tag<string>({ label: "todo.tenant.id" })
export const actorId = tag<string>({ label: "todo.actor.id" })
export const operation = tag<string>({ label: "todo.operation" })

export function createMemoryStore(): TodoStore {
  let next = 1
  const rows = new Map<string, Todo>()

  return {
    async list(tenantId) {
      return [...rows.values()].filter((todo) => todo.tenantId === tenantId)
    },
    async create(input) {
      const todo: Todo = {
        id: `todo-${next++}`,
        tenantId: input.tenantId,
        title: input.title,
        status: "open",
        createdBy: input.actorId,
        updatedBy: input.actorId,
        lastRequestId: input.requestId,
        lastOperation: input.operation,
      }
      rows.set(todo.id, todo)
      return todo
    },
    async toggle(input) {
      const existing = rows.get(input.id)
      if (!existing || existing.tenantId !== input.tenantId) throw new TodoNotFound(input.id)
      const todo: Todo = {
        ...existing,
        status: existing.status === "open" ? "done" : "open",
        updatedBy: input.actorId,
        lastRequestId: input.requestId,
        lastOperation: input.operation,
      }
      rows.set(todo.id, todo)
      return todo
    },
    async clearCompleted(input) {
      const removed = [...rows.values()].filter(
        (todo) => todo.tenantId === input.tenantId && todo.status === "done"
      )
      for (const todo of removed) rows.delete(todo.id)
      return removed
    },
  }
}

export const store = atom({
  factory: () => createMemoryStore(),
})

export const listTodos = flow({
  name: "todo.list",
  deps: {
    store,
    tenantId: tags.required(tenantId),
  },
  factory: (_ctx, deps) => deps.store.list(deps.tenantId),
})

export const createTodo = flow({
  name: "todo.create",
  parse: (input) => createTodoInput.parse(input),
  deps: {
    store,
    tenantId: tags.required(tenantId),
    actorId: tags.required(actorId),
    requestId: tags.required(requestId),
    operation: tags.required(operation),
  },
  factory: (ctx, deps) =>
    deps.store.create({
      tenantId: deps.tenantId,
      actorId: deps.actorId,
      requestId: deps.requestId,
      operation: deps.operation,
      title: ctx.input.title,
    }),
})

export const toggleTodo = flow({
  name: "todo.toggle",
  parse: (input) => toggleTodoInput.parse(input),
  deps: {
    store,
    tenantId: tags.required(tenantId),
    actorId: tags.required(actorId),
    requestId: tags.required(requestId),
    operation: tags.required(operation),
  },
  factory: (ctx, deps) =>
    deps.store.toggle({
      id: ctx.input.id,
      tenantId: deps.tenantId,
      actorId: deps.actorId,
      requestId: deps.requestId,
      operation: deps.operation,
    }),
})

export const clearCompleted = flow({
  name: "todo.clearCompleted",
  deps: {
    store,
    tenantId: tags.required(tenantId),
    actorId: tags.required(actorId),
    requestId: tags.required(requestId),
    operation: tags.required(operation),
  },
  factory: (_ctx, deps) =>
    deps.store.clearCompleted({
      tenantId: deps.tenantId,
      actorId: deps.actorId,
      requestId: deps.requestId,
      operation: deps.operation,
    }),
})
