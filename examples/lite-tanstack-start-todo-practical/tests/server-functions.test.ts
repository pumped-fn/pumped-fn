import { describe, expect, it } from "vitest"
import {
  clearCompleted,
  createTodo,
  listTodos,
  TodoValidationError,
  toggleTodo,
} from "../src/domain"
import { clearCall, createCall, listCall, lite, request, toggleCall } from "../src/start"
import { clearCompletedFn, createTodoFn, listTodosFn, toggleTodoFn } from "../src/functions"
import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
import { ParseError } from "@pumped-fn/lite"

describe("tanstack start todo functions", () => {
  it("keeps request tags and function tags explicit across the middleware chain", async () => {
    const tenant = "tenant-start-a"
    const created = await invokeThroughStart({
      path: "/todos",
      method: "POST",
      headers: {
        "x-request-id": "req-a",
        "x-tenant-id": tenant,
        "x-actor-id": "actor-a",
      },
      call: createCall,
      data: { title: " Ship fullstack example " },
      handler: lite.handler(createTodo),
    })
    const listed = await invokeThroughStart({
      path: "/todos",
      method: "GET",
      headers: {
        "x-request-id": "req-b",
        "x-tenant-id": tenant,
        "x-actor-id": "actor-b",
      },
      call: listCall,
      data: undefined,
      handler: lite.handler(listTodos),
    })
    const toggled = await invokeThroughStart({
      path: `/todos/${created.id}/toggle`,
      method: "POST",
      headers: {
        "x-request-id": "req-c",
        "x-tenant-id": tenant,
        "x-actor-id": "actor-c",
      },
      call: toggleCall,
      data: { id: created.id },
      handler: lite.handler(toggleTodo),
    })
    const cleared = await invokeThroughStart({
      path: "/todos/completed",
      method: "POST",
      headers: {
        "x-request-id": "req-d",
        "x-tenant-id": tenant,
        "x-actor-id": "actor-d",
      },
      call: clearCall,
      data: undefined,
      handler: lite.handler(clearCompleted),
    })

    expect(created).toMatchObject({
      tenantId: tenant,
      title: "Ship fullstack example",
      status: "open",
      createdBy: "actor-a",
      lastRequestId: "req-a",
      lastOperation: "todo.create",
    })
    expect(listed).toEqual({
      todos: [created],
      tenantId: tenant,
      requestId: "req-b",
      operation: "todo.list",
    })
    expect(toggled).toMatchObject({
      id: created.id,
      status: "done",
      updatedBy: "actor-c",
      lastRequestId: "req-c",
      lastOperation: "todo.toggle",
    })
    expect(cleared).toEqual({ deleted: [toggled] })
  })

  it("exports callable TanStack Start functions for the React surface", () => {
    expect(typeof listTodosFn).toBe("function")
    expect(typeof createTodoFn).toBe("function")
    expect(typeof toggleTodoFn).toBe("function")
    expect(typeof clearCompletedFn).toBe("function")
  })

  it("lets operation middleware carry request middleware through TanStack composition", () => {
    expect(listCall.options.middleware).toEqual([request])
    expect(createCall.options.middleware).toEqual([request])
    expect(toggleCall.options.middleware).toEqual([request])
    expect(clearCall.options.middleware).toEqual([request])
  })

  it("keeps malformed runtime input inside domain validation", async () => {
    const failed = invokeThroughStart({
      path: "/todos",
      method: "POST",
      headers: {
        "x-request-id": "req-invalid",
        "x-tenant-id": "tenant-start-invalid",
        "x-actor-id": "actor-invalid",
      },
      call: createCall,
      data: {} as { title: string },
      handler: lite.handler(createTodo),
    })

    await expect(failed).rejects.toBeInstanceOf(ParseError)
    await expect(failed).rejects.toMatchObject({ cause: expect.any(TodoValidationError) })
  })
})

async function invokeThroughStart<Output, Input>(options: {
  path: string
  method: "GET" | "POST"
  headers: Record<string, string>
  call: typeof listCall
  data: Input
  handler: (event: tanstackStart.HandlerEvent<Input>) => Promise<Output>
}): Promise<Output> {
  const incoming = new Request(`https://todo.test${options.path}`, { headers: options.headers })
  const controller = new AbortController()
  let output!: Output
  const result = await request.options.server!({
    request: incoming,
    pathname: options.path,
    context: {},
    handlerType: "router",
    next: async (requestOptions: { context: tanstackStart.Context }) => {
      await options.call.options.server!({
        data: options.data,
        context: requestOptions.context,
        method: options.method,
        serverFnMeta: {
          id: options.path,
          name: options.path,
          filename: "src/functions.ts",
        },
        signal: controller.signal,
        next: async (callOptions: { context: tanstackStart.Context }) => {
          output = await options.handler({
            data: options.data,
            context: callOptions.context,
          })
          return functionResult({ context: callOptions.context })
        },
      } as unknown as Parameters<NonNullable<typeof options.call.options.server>>[0])

      return {
        request: incoming,
        pathname: options.path,
        context: requestOptions.context,
        response: Response.json(output),
      }
    },
  } as unknown as Parameters<NonNullable<typeof request.options.server>>[0])

  if (result instanceof Response) throw new Error("expected TanStack request result")
  return output
}

function functionResult(options: { context: tanstackStart.Context }) {
  return {
    "use functions must return the result of next()": true,
    "~types": {
      context: options.context,
      sendContext: undefined,
    },
    context: options.context,
    sendContext: undefined,
  }
}
