import { createScope, type Lite } from "@pumped-fn/lite"
import { hono } from "@pumped-fn/lite-hono"
import { Hono } from "hono"
import {
  actorId,
  clearCompleted,
  createTodo,
  listTodos,
  operation,
  requestId,
  tenantId,
  TodoNotFound,
  TodoValidationError,
  toggleTodo,
  type CreateTodoInput,
} from "./domain"

export interface TodoBackend {
  app: Hono<hono.Env>
  scope: Lite.Scope
  dispose(): Promise<void>
}

export function createTodoBackend(options: Lite.ScopeOptions = {}): TodoBackend {
  const lite = hono.adapter()
  const scope = createScope({
    ...options,
    extensions: [...(options.extensions ?? []), lite],
  })
  const app = new Hono<hono.Env>()

  app.use(
    "*",
    lite.middleware({
      tags: (request) => [
        requestId(request.headers.get("x-request-id") ?? "missing"),
        tenantId(request.headers.get("x-tenant-id") ?? "default"),
        actorId(request.headers.get("x-actor-id") ?? "anonymous"),
        operation(`${request.method}:${new URL(request.url).pathname}`),
      ],
    })
  )

  app.get("/todos", async (context) =>
    context.json(await context.var.lite.exec({ flow: listTodos }))
  )

  app.post("/todos", async (context) =>
    context.json(
      await context.var.lite.exec({
        flow: createTodo,
        input: (await context.req.json()) as CreateTodoInput,
      }),
      201
    )
  )

  app.post("/todos/:id/toggle", async (context) =>
    context.json(
      await context.var.lite.exec({
        flow: toggleTodo,
        input: { id: context.req.param("id") },
      })
    )
  )

  app.delete("/todos/completed", async (context) =>
    context.json({
      deleted: await context.var.lite.exec({ flow: clearCompleted }),
    })
  )

  app.onError((error, context) => {
    if (error instanceof TodoValidationError) return context.json({ error: error.message }, 400)
    if (error instanceof TodoNotFound) return context.json({ error: error.message }, 404)
    return context.json({ error: "todo backend failed" }, 500)
  })

  return {
    app,
    scope,
    dispose: () => scope.dispose(),
  }
}
