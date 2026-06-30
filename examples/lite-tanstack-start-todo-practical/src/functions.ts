import { createServerFn } from "@tanstack/react-start"
import {
  clearCompleted,
  createTodo,
  listTodos,
  toggleTodo,
  type CreateTodoInput,
  type ToggleTodoInput,
} from "./domain"
import { clearCall, createCall, listCall, lite, request, toggleCall } from "./start"

export const listTodosFn = createServerFn({ method: "GET" })
  .middleware([request, listCall])
  .handler(lite.handler(listTodos))

export const createTodoFn = createServerFn({ method: "POST" })
  .middleware([request, createCall])
  .validator((input: CreateTodoInput) => input)
  .handler(lite.handler(createTodo))

export const toggleTodoFn = createServerFn({ method: "POST" })
  .middleware([request, toggleCall])
  .validator((input: ToggleTodoInput) => input)
  .handler(lite.handler(toggleTodo))

export const clearCompletedFn = createServerFn({ method: "POST" })
  .middleware([request, clearCall])
  .handler(lite.handler(clearCompleted))
