import { createScope, ParseError, preset } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { ZodError } from "zod"
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
  toggleTodo,
} from "../src/domain"

describe("todo domain", () => {
  it("runs the same flows with explicit presets and tags", async () => {
    const scope = createScope({
      presets: [preset(store, createMemoryStore())],
      tags: [
        tenantId("tenant-a"),
        actorId("actor-a"),
        requestId("request-a"),
        operation("test:create"),
      ],
    })
    const context = scope.createContext()

    const created = await context.exec({
      flow: createTodo,
      input: { title: "  Write adapter example  " },
    })
    const toggled = await context.exec({
      flow: toggleTodo,
      input: { id: created.id },
      tags: [requestId("request-b"), operation("test:toggle")],
    })
    const listed = await context.exec({ flow: listTodos })
    const deleted = await context.exec({
      flow: clearCompleted,
      tags: [requestId("request-c"), operation("test:clear")],
    })

    expect(created).toMatchObject({
      tenantId: "tenant-a",
      title: "Write adapter example",
      status: "open",
      createdBy: "actor-a",
      lastRequestId: "request-a",
      lastOperation: "test:create",
    })
    expect(toggled).toMatchObject({
      id: created.id,
      status: "done",
      lastRequestId: "request-b",
      lastOperation: "test:toggle",
    })
    expect(listed).toEqual([toggled])
    expect(deleted).toEqual([toggled])
    expect(await context.exec({ flow: listTodos })).toEqual([])
    await context.close({ ok: true })
    await scope.dispose()
  })

  it("rejects empty titles and tenant-mismatched ids at the scope seam", async () => {
    const scope = createScope({
      presets: [preset(store, createMemoryStore())],
      tags: [
        tenantId("tenant-a"),
        actorId("actor-a"),
        requestId("request-a"),
        operation("test:create"),
      ],
    })
    const context = scope.createContext()
    const created = await context.exec({
      flow: createTodo,
      input: { title: "Keep tenant local" },
    })

    const invalidTitle = context.exec({ flow: createTodo, input: { title: "  " } })
    await expect(invalidTitle).rejects.toBeInstanceOf(ParseError)
    await expect(invalidTitle).rejects.toMatchObject({ cause: expect.any(ZodError) })
    await expect(
      context.exec({
        flow: toggleTodo,
        input: { id: created.id },
        tags: [tenantId("tenant-b"), requestId("request-b"), operation("test:toggle")],
      })
    ).rejects.toBeInstanceOf(TodoNotFound)
    await context.close({ ok: true })
    await scope.dispose()
  })
})
