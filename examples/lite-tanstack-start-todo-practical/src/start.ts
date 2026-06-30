import { createScope } from "@pumped-fn/lite"
import { tanstackStart } from "@pumped-fn/lite-tanstack-start"
import { createStart } from "@tanstack/react-start"
import { actorId, operation, requestId, tenantId } from "./domain"

export const lite = tanstackStart.adapter()

const scope = createScope({
  extensions: [lite],
})

export const request = lite.request({
  tags: (request) => [
    requestId(request.headers.get("x-request-id") ?? "missing"),
    tenantId(request.headers.get("x-tenant-id") ?? "default"),
    actorId(request.headers.get("x-actor-id") ?? "anonymous"),
  ],
})

export const listCall = lite.call({
  tags: () => [operation("todo.list")],
})

export const createCall = lite.call({
  tags: () => [operation("todo.create")],
})

export const toggleCall = lite.call({
  tags: () => [operation("todo.toggle")],
})

export const clearCall = lite.call({
  tags: () => [operation("todo.clearCompleted")],
})

export const startInstance = createStart(() => ({
  requestMiddleware: [request],
  functionMiddleware: [],
}))
