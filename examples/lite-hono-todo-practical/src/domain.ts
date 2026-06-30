import { atom, flow, tag, tags, typed } from "@pumped-fn/lite"

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

export interface CreateTodoInput {
  title: string
}

export interface ToggleTodoInput {
  id: string
}

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

export class TodoValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TodoValidationError"
  }
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
  parse: typed<CreateTodoInput>(),
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
      title: normalizeTitle(ctx.input.title),
    }),
})

export const toggleTodo = flow({
  name: "todo.toggle",
  parse: typed<ToggleTodoInput>(),
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

function normalizeTitle(input: string): string {
  const title = input.trim()
  if (title.length === 0) throw new TodoValidationError("title is required")
  return title
}
