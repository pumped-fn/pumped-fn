import { createScope, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import {
  actorId,
  clearCompleted,
  createMemoryStore,
  createTodo,
  listTodos,
  operation,
  requestId,
  store,
  tenantId,
  TodoNotFound,
  TodoValidationError,
  toggleTodo,
} from "../src/domain"

describe("todo domain", () => {
  it("runs fullstack flows with only scope presets and tags", async () => {
    const scope = createScope({
      presets: [preset(store, createMemoryStore())],
      tags: [
        tenantId("tenant-a"),
        actorId("actor-a"),
        requestId("request-a"),
        operation("todo.create"),
      ],
    })
    const context = scope.createContext()
    const created = await context.exec({
      flow: createTodo,
      input: { title: "  Render server function state  " },
    })
    const toggled = await context.exec({
      flow: toggleTodo,
      input: { id: created.id },
      tags: [requestId("request-b"), operation("todo.toggle")],
    })
    const listed = await context.exec({
      flow: listTodos,
      tags: [requestId("request-c"), operation("todo.list")],
    })
    const cleared = await context.exec({
      flow: clearCompleted,
      tags: [requestId("request-d"), operation("todo.clearCompleted")],
    })

    expect(created).toMatchObject({
      tenantId: "tenant-a",
      title: "Render server function state",
      status: "open",
      createdBy: "actor-a",
      lastRequestId: "request-a",
      lastOperation: "todo.create",
    })
    expect(toggled).toMatchObject({
      id: created.id,
      status: "done",
      lastRequestId: "request-b",
      lastOperation: "todo.toggle",
    })
    expect(listed).toEqual({
      todos: [toggled],
      tenantId: "tenant-a",
      requestId: "request-c",
      operation: "todo.list",
    })
    expect(cleared).toEqual({ deleted: [toggled] })
    await context.close({ ok: true })
    await scope.dispose()
  })

  it("fails invalid mutations at the same public seam", async () => {
    const scope = createScope({
      presets: [preset(store, createMemoryStore())],
      tags: [
        tenantId("tenant-a"),
        actorId("actor-a"),
        requestId("request-a"),
        operation("todo.create"),
      ],
    })
    const context = scope.createContext()
    const created = await context.exec({
      flow: createTodo,
      input: { title: "Keep tenant boundary" },
    })

    await expect(context.exec({ flow: createTodo, input: { title: " " } })).rejects.toBeInstanceOf(
      TodoValidationError
    )
    await expect(
      context.exec({
        flow: toggleTodo,
        input: { id: created.id },
        tags: [tenantId("tenant-b"), requestId("request-b"), operation("todo.toggle")],
      })
    ).rejects.toBeInstanceOf(TodoNotFound)
    await context.close({ ok: true })
    await scope.dispose()
  })
})
