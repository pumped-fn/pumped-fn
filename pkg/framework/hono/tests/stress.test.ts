import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createScope, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import { Hono } from "hono"
import { describe, expect, it } from "vitest"
import { hono } from "../src/index"

const requestId = tag<string>({ label: "stress.request.id" })
const tenantId = tag<string>({ label: "stress.tenant.id" })
const operation = tag<string>({ label: "stress.operation" })

describe("stress integration", () => {
  it("keeps framework values explicit through deps across request execution", async () => {
    type BaseEnv = { Variables: { auth: string } }
    type AppEnv = hono.Env<BaseEnv>

    const cleanups: string[] = []
    const audit = resource({
      name: "stress.audit",
      ownership: "current",
      deps: {
        requestId: tags.required(requestId),
        tenantId: tags.required(tenantId),
        operation: tags.required(operation),
      },
      factory: (ctx, deps) => {
        const entries: string[] = []
        ctx.cleanup(() => {
          cleanups.push(`${deps.tenantId}:${deps.requestId}:${deps.operation}:${entries.length}`)
        })
        return {
          record: (event: string) => {
            entries.push(`${deps.tenantId}:${deps.requestId}:${deps.operation}:${event}`)
          },
          snapshot: () => [...entries],
        }
      },
    })
    const confirm = flow({
      name: "stress.confirm",
      deps: { audit },
      factory: (_ctx, deps) => {
        deps.audit.record("confirm")
        return deps.audit.snapshot()
      },
    })
    const checkout = flow({
      name: "stress.checkout",
      parse: typed<{ sku: string; quantity: number }>(),
      deps: {
        requestId: tags.required(requestId),
        tenantId: tags.required(tenantId),
        operation: tags.required(operation),
        audit,
      },
      factory: async (ctx, deps) => {
        deps.audit.record(`checkout:${ctx.input.sku}:${ctx.input.quantity}`)
        return {
          requestId: deps.requestId,
          tenantId: deps.tenantId,
          operation: deps.operation,
          confirmation: await ctx.exec({ flow: confirm }),
          events: deps.audit.snapshot(),
        }
      },
    })
    const lite = hono.adapter()
    const scope = createScope({ extensions: [lite] })
    const closed: string[] = []
    const app = new Hono<AppEnv>()

    expect(Object.keys(audit.deps ?? {}).sort()).toEqual(["operation", "requestId", "tenantId"])
    expect(Object.keys(checkout.deps ?? {}).sort()).toEqual([
      "audit",
      "operation",
      "requestId",
      "tenantId",
    ])

    app.use(
      "*",
      lite.middleware<BaseEnv>({
        tags: (request) => [
          requestId(request.headers.get("x-request-id") ?? "missing"),
          tenantId(request.headers.get("x-tenant-id") ?? "missing"),
          operation(`${request.method}:${new URL(request.url).pathname}`),
        ],
      })
    )
    app.use("*", async (context, next) => {
      context.var.lite.onClose((result) => {
        closed.push(result.ok ? "request:ok" : "request:error")
      })
      await next()
    })
    app.post("/orders", async (context) =>
      context.json(
        await context.var.lite.exec({
          flow: checkout,
          input: (await context.req.json()) as { sku: string; quantity: number },
        })
      )
    )

    const first = await app.request("/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-a",
        "x-tenant-id": "tenant-a",
      },
      body: JSON.stringify({ sku: "sku-a", quantity: 2 }),
    })
    const second = await app.request("/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "req-b",
        "x-tenant-id": "tenant-b",
      },
      body: JSON.stringify({ sku: "sku-b", quantity: 1 }),
    })

    expect(await first.json()).toEqual({
      requestId: "req-a",
      tenantId: "tenant-a",
      operation: "POST:/orders",
      confirmation: [
        "tenant-a:req-a:POST:/orders:checkout:sku-a:2",
        "tenant-a:req-a:POST:/orders:confirm",
      ],
      events: [
        "tenant-a:req-a:POST:/orders:checkout:sku-a:2",
        "tenant-a:req-a:POST:/orders:confirm",
      ],
    })
    expect(await second.json()).toEqual({
      requestId: "req-b",
      tenantId: "tenant-b",
      operation: "POST:/orders",
      confirmation: [
        "tenant-b:req-b:POST:/orders:checkout:sku-b:1",
        "tenant-b:req-b:POST:/orders:confirm",
      ],
      events: [
        "tenant-b:req-b:POST:/orders:checkout:sku-b:1",
        "tenant-b:req-b:POST:/orders:confirm",
      ],
    })
    expect(cleanups).toEqual([
      "tenant-a:req-a:POST:/orders:2",
      "tenant-b:req-b:POST:/orders:2",
    ])
    expect(closed).toEqual(["request:ok", "request:ok"])
    await scope.dispose()
  })
})

describe("anti-pattern guardrails", () => {
  it("keeps adapter package surfaces free of implicit external reads", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const files = [
      "src/index.ts",
      "README.md",
      "tests/hono.test.ts",
      "tests/stress.test.ts",
      "tests/type-contracts.ts",
    ].map((path) => [path, readFileSync(resolve(root, path), "utf8")] as const)
    const forbidden = [
      ["top-level generic export", /^export (?:const|function|interface|type) (?:contextKey|adapter|KeyOptions|Env|Options|Adapter)\b/m],
      ["scope parameter helper", /\b(?:middleware|get|exec)\s*\(\s*scope\b/],
      ["context parameter helper", /\b(?:get|exec)\s*\(\s*context\b/],
      ["ambient tag read", new RegExp(`\\.data\\.${["seek", "Tag"].join("")}\\s*\\(`)],
      ["ambient data read", /\.data\.(?:get|seek)\s*\(/],
    ] as const

    for (const [path, source] of files) {
      for (const [name, pattern] of forbidden) {
        expect(source, `${path} contains ${name}`).not.toMatch(pattern)
      }
    }
  })
})
