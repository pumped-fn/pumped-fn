import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { atom, createScope, flow, preset, typed } from "@pumped-fn/lite"
import { expect, it } from "vitest"
import { z } from "zod"
import { mcpConfig, mcpServer, mcpToolMeta } from "../src/index"

class ProbeError extends Error {
  override readonly name = "ProbeError"
}

const rate = atom({ factory: () => 1 })

const amount = { amount: z.number() }

const convert = flow({
  name: "convert",
  parse: (raw) => z.object(amount).parse(raw),
  deps: { rate },
  tags: [mcpToolMeta({ description: "Convert an amount by the configured rate", inputSchema: amount })],
  factory: (ctx, { rate }) => ({ converted: ctx.input.amount * rate }),
})

const ping = flow({
  name: "ping",
  parse: typed<{ x: number }>(),
  tags: [mcpToolMeta({ description: "Echo x back", inputSchema: { x: z.number() } })],
  factory: (ctx) => `pong:${ctx.input.x}`,
})

const boom = flow({
  name: "boom",
  parse: typed<{ x: number }>(),
  tags: [mcpToolMeta({ description: "Always fails", inputSchema: { x: z.number() } })],
  factory: () => {
    throw new ProbeError("nope")
  },
})

const coerce = flow({
  name: "coerce",
  parse: (raw) => z.object({ n: z.string().transform(Number) }).parse(raw),
  tags: [mcpToolMeta({ description: "Double a numeric string", inputSchema: { n: z.string().transform(Number) } })],
  factory: (ctx) => ({ doubled: ctx.input.n * 2 }),
})

const big = flow({
  name: "big",
  parse: typed<void>(),
  tags: [mcpToolMeta({ description: "Return a bigint", inputSchema: {} })],
  factory: () => ({ big: 42n }),
})

let releaseSlow: (() => void) | undefined
let slowStarted: (() => void) | undefined
let slowFinished = false

const slow = flow({
  name: "slow",
  parse: typed<void>(),
  tags: [mcpToolMeta({ description: "Wait for release", inputSchema: {} })],
  factory: async () => {
    slowStarted?.()
    await new Promise<void>((resolve) => {
      releaseSlow = resolve
    })
    slowFinished = true
    return "done"
  },
})

async function connected(server: McpServer) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "test-client", version: "0.0.0" })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

async function serve(tools: Parameters<typeof mcpConfig>[0]["tools"]) {
  const scope = createScope({
    presets: [preset(rate, 2)],
    tags: [mcpConfig({ name: "test", version: "0.0.0", tools })],
  })
  const ctx = scope.createContext()
  const server = await ctx.resolve(mcpServer)
  const client = await connected(server)
  return {
    client,
    async shutdown() {
      await ctx.close()
      await scope.dispose()
    },
    async close() {
      await client.close()
      await ctx.close()
      await scope.dispose()
    },
  }
}

it("exposes multiple flows as MCP tools and runs them inside the resolving scope", async () => {
  const { client, close } = await serve([convert, ping])

  const listed = await client.listTools()
  expect(listed.tools.map((tool) => tool.name).sort()).toEqual(["convert", "ping"])

  const converted = await client.callTool({ name: "convert", arguments: { amount: 10 } })
  expect(converted.content).toEqual([{ type: "text", text: JSON.stringify({ converted: 20 }) }])

  const pinged = await client.callTool({ name: "ping", arguments: { x: 3 } })
  expect(pinged.content).toEqual([{ type: "text", text: "pong:3" }])

  await close()
})

it("coerces arguments through inputSchema before the flow runs", async () => {
  const { client, close } = await serve([coerce])
  const result = await client.callTool({ name: "coerce", arguments: { n: "5" } })
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify({ doubled: 10 }) }])
  await close()
})

it("serializes BigInt output instead of failing the call", async () => {
  const { client, close } = await serve([big])
  const result = await client.callTool({ name: "big", arguments: {} })
  expect(result.isError).toBeFalsy()
  expect(result.content).toEqual([{ type: "text", text: JSON.stringify({ big: "42" }) }])
  await close()
})

it("drains active tool calls before closing the server", async () => {
  const started = new Promise<void>((resolve) => {
    slowStarted = resolve
  })
  const { client, shutdown } = await serve([slow])
  const call = client.callTool({ name: "slow", arguments: {} })
  await started
  let closed = false
  const closing = shutdown().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  releaseSlow?.()
  expect(await call).toMatchObject({ content: [{ type: "text", text: "done" }] })
  expect(slowFinished).toBe(true)
  await closing
  await client.close()
  releaseSlow = undefined
  slowStarted = undefined
  slowFinished = false
})

it("maps a tool failure to an MCP error result", async () => {
  const { client, close } = await serve([boom])
  const result = await client.callTool({ name: "boom", arguments: { x: 1 } })
  expect(result.isError).toBe(true)
  await close()
})

it("rejects arguments that violate the declared schema before the flow runs", async () => {
  const { client, close } = await serve([ping])
  const result = await client.callTool({ name: "ping", arguments: { x: "not-a-number" } })
  expect(result.isError).toBe(true)
  await close()
})

it("fails to resolve when an enlisted flow lacks a name", async () => {
  const nameless = flow({
    parse: typed<void>(),
    tags: [mcpToolMeta({ description: "no name", inputSchema: {} })],
    factory: () => "x",
  })
  const scope = createScope({
    tags: [mcpConfig({ name: "test", version: "0.0.0", tools: [nameless] })],
  })
  const ctx = scope.createContext()
  await expect(ctx.resolve(mcpServer)).rejects.toThrow(/requires a name/)
  await ctx.close()
  await scope.dispose()
})

it("fails to resolve when an enlisted flow lacks a meta tag", async () => {
  const untagged = flow({ name: "untagged", parse: typed<void>(), factory: () => "x" })
  const scope = createScope({
    tags: [mcpConfig({ name: "test", version: "0.0.0", tools: [untagged] })],
  })
  const ctx = scope.createContext()
  await expect(ctx.resolve(mcpServer)).rejects.toThrow(/missing an mcpToolMeta tag/)
  await ctx.close()
  await scope.dispose()
})
