import { afterAll, describe, expect, it } from "vitest"
import { app, dispose } from "../src/app"
import type { Todo } from "../src/domain"

describe("hono todo backend", () => {
  afterAll(async () => {
    await dispose()
  })

  it("serves tenant-scoped todos through real Hono requests", async () => {
    const first = await app.request("/todos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-a",
        "x-tenant-id": "tenant-a",
        "x-actor-id": "actor-a",
      },
      body: JSON.stringify({ title: " Ship backend example " }),
    })
    const second = await app.request("/todos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-b",
        "x-tenant-id": "tenant-b",
        "x-actor-id": "actor-b",
      },
      body: JSON.stringify({ title: "Keep separate" }),
    })
    const created = (await first.json()) as Todo
    const other = (await second.json()) as Todo
    const toggledResponse = await app.request(`/todos/${created.id}/toggle`, {
      method: "POST",
      headers: {
        "x-request-id": "req-c",
        "x-tenant-id": "tenant-a",
        "x-actor-id": "actor-c",
      },
    })
    const tenantA = await app.request("/todos", {
      headers: { "x-tenant-id": "tenant-a" },
    })
    const tenantB = await app.request("/todos", {
      headers: { "x-tenant-id": "tenant-b" },
    })
    const deleted = await app.request("/todos/completed", {
      method: "DELETE",
      headers: {
        "x-request-id": "req-d",
        "x-tenant-id": "tenant-a",
        "x-actor-id": "actor-d",
      },
    })
    const tenantAAfterDelete = await app.request("/todos", {
      headers: { "x-tenant-id": "tenant-a" },
    })

    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(created).toMatchObject({
      tenantId: "tenant-a",
      title: "Ship backend example",
      status: "open",
      createdBy: "actor-a",
      lastRequestId: "req-a",
      lastOperation: "POST:/todos",
    })
    expect(other).toMatchObject({
      tenantId: "tenant-b",
      title: "Keep separate",
    })
    expect(await toggledResponse.json()).toMatchObject({
      id: created.id,
      status: "done",
      updatedBy: "actor-c",
      lastRequestId: "req-c",
      lastOperation: `POST:/todos/${created.id}/toggle`,
    })
    expect(await tenantA.json()).toEqual([
      {
        ...created,
        status: "done",
        updatedBy: "actor-c",
        lastRequestId: "req-c",
        lastOperation: `POST:/todos/${created.id}/toggle`,
      },
    ])
    expect(await tenantB.json()).toEqual([other])
    expect(await deleted.json()).toEqual({
      deleted: [
        {
          ...created,
          status: "done",
          updatedBy: "actor-c",
          lastRequestId: "req-c",
          lastOperation: `POST:/todos/${created.id}/toggle`,
        },
      ],
    })
    expect(await tenantAAfterDelete.json()).toEqual([])
  })

  it("maps domain errors without route-level scope access", async () => {
    const invalid = await app.request("/todos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-a",
        "x-tenant-id": "tenant-error",
        "x-actor-id": "actor-a",
      },
      body: JSON.stringify({ title: " " }),
    })
    const missing = await app.request("/todos/todo-missing/toggle", {
      method: "POST",
      headers: {
        "x-request-id": "req-b",
        "x-tenant-id": "tenant-error",
        "x-actor-id": "actor-a",
      },
    })
    const malformed = await app.request("/todos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-c",
        "x-tenant-id": "tenant-error",
        "x-actor-id": "actor-a",
      },
      body: JSON.stringify({}),
    })

    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toEqual({ error: "title is required" })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toEqual({ error: "todo not found: todo-missing" })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toEqual({ error: "title is required" })
  })
})
