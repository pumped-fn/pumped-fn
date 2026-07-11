# @pumped-fn/sdk-mcp

> **Status: experimental.** APIs change without notice; not recommended for production yet.

Expose pumped-fn flows — including your `@pumped-fn/sdk` agent tools — as an
[MCP](https://modelcontextprotocol.io) server. Each tool call runs the flow inside your scope —
same deps, presets, and trace as any other graph edge.

A flow becomes a tool by carrying an `mcpToolMeta` tag (description + Zod input shape). List the
flows in `mcpConfig`; the `mcpServer` resource registers each and stays generic. The input shape is
declared once and shared between the flow's `parse` and the tool schema.

```ts
import { atom, createScope, flow } from "@pumped-fn/lite"
import { mcpConfig, mcpServer, mcpToolMeta } from "@pumped-fn/sdk-mcp"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const rate = atom({ factory: () => 1.1 })

const amount = { amount: z.number() }

const convert = flow({
  name: "convert",
  parse: (raw) => z.object(amount).parse(raw),
  deps: { rate },
  tags: [mcpToolMeta({ description: "Convert an amount", inputSchema: amount })],
  factory: (ctx, { rate }) => ({ converted: ctx.input.amount * rate }),
})

const scope = createScope({
  tags: [mcpConfig({ name: "billing", version: "1.0.0", tools: [convert] })],
})
const ctx = scope.createContext()

// The composition root owns the transport, exactly as it owns the scope.
const server = await ctx.resolve(mcpServer)
await server.connect(new StdioServerTransport())
```

The MCP SDK validates and coerces arguments against each flow's `inputSchema`, then the handler
execs the flow with that value as raw input. A flow's own `parse` re-runs on it, so put any
coercion in `inputSchema` and keep the exposed flow `typed<T>()` (or its `parse` non-transforming) —
otherwise a `z.string().transform(Number)` would transform twice. A thrown error's message becomes
the `isError` result text sent to the client, so throw client-safe messages. Cleanup closes the
server and drains in-flight calls; for a clean shutdown, close the client before disposing the
scope. For tests, connect an `InMemoryTransport.createLinkedPair()` instead of stdio.

---
Part of [pumped-fn](https://github.com/pumped-fn/pumped-fn) — start with the [docs](https://github.com/pumped-fn/pumped-fn/tree/main/docs) or the [mental model](https://github.com/pumped-fn/pumped-fn/blob/main/docs/mental-model.md).
