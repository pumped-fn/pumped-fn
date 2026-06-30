import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createScope, flow, resource, tag, tags, typed } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import { tanstackStart } from "../src/index"

const requestId = tag<string>({ label: "stress.request.id" })
const tenantId = tag<string>({ label: "stress.tenant.id" })
const operation = tag<string>({ label: "stress.operation" })

describe("stress integration", () => {
  it("keeps request and function values explicit through deps", async () => {
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
    const lite = tanstackStart.adapter()
    const scope = createScope({ extensions: [lite] })
    const closed: string[] = []
    const incoming = new Request("https://example.test/orders", {
      headers: {
        "x-request-id": "req-a",
        "x-tenant-id": "tenant-a",
      },
    })
    const withRequest = lite.request({
      tags: (request) => [
        requestId(request.headers.get("x-request-id") ?? "missing"),
        tenantId(request.headers.get("x-tenant-id") ?? "missing"),
      ],
    })
    const withCall = lite.call({
      tags: () => [operation("POST:/orders")],
    })
    const handleCheckout = lite.handler(checkout)
    const controller = new AbortController()
    let output!: Awaited<ReturnType<typeof handleCheckout>>

    expect(Object.keys(audit.deps ?? {}).sort()).toEqual(["operation", "requestId", "tenantId"])
    expect(Object.keys(checkout.deps ?? {}).sort()).toEqual([
      "audit",
      "operation",
      "requestId",
      "tenantId",
    ])

    const result = await withRequest.options.server!({
      request: incoming,
      pathname: "/orders",
      context: {},
      handlerType: "router",
      next: async (requestOptions: { context: tanstackStart.Context }) => {
        requestOptions.context.lite.onClose((closeResult) => {
          closed.push(closeResult.ok ? "request:ok" : "request:error")
        })
        await withCall.options.server!({
          data: { sku: "sku-a", quantity: 2 },
          context: requestOptions.context,
          method: "POST",
          serverFnMeta: {
            id: "checkout",
            name: "checkout",
            filename: "src/routes/orders.tsx",
          },
          signal: controller.signal,
          next: async (callOptions: { context: tanstackStart.Context }) => {
            callOptions.context.lite.onClose((closeResult) => {
              closed.push(closeResult.ok ? "call:ok" : "call:error")
            })
            output = await handleCheckout({
              data: { sku: "sku-a", quantity: 2 },
              context: callOptions.context,
            })
            return {
              "use functions must return the result of next()": true,
              "~types": {
                context: callOptions.context,
                sendContext: undefined,
              },
              context: callOptions.context,
              sendContext: undefined,
            }
          },
        } as unknown as Parameters<NonNullable<typeof withCall.options.server>>[0])

        return {
          request: incoming,
          pathname: "/orders",
          context: requestOptions.context,
          response: Response.json(output),
        }
      },
    } as unknown as Parameters<NonNullable<typeof withRequest.options.server>>[0])

    if (result instanceof Response) throw new Error("expected TanStack request result")

    expect(await result.response.json()).toEqual({
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
    expect(cleanups).toEqual(["tenant-a:req-a:POST:/orders:2"])
    expect(closed).toEqual(["call:ok", "request:ok"])
    await scope.dispose()
  })
})

describe("anti-pattern guardrails", () => {
  it("keeps adapter package surfaces free of implicit external reads", () => {
    const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
    const files = [
      "src/index.ts",
      "README.md",
      "tests/tanstack-start.test.ts",
      "tests/stress.test.ts",
      "tests/type-contracts.ts",
    ].map((path) => [path, readFileSync(resolve(root, path), "utf8")] as const)
    const forbidden = [
      ["top-level generic export", /^export (?:const|function|interface|type) (?:contextKey|adapter|KeyOptions|Context|RequestOptions|CallOptions|HandlerEvent|Adapter)\b/m],
      ["scope parameter helper", /\b(?:request|call|get|exec|handler)\s*\(\s*scope\b/],
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
