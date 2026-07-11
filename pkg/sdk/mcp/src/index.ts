import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import { resource, tag, tags, type Lite } from "@pumped-fn/lite"
import type { ZodRawShape } from "zod"

export interface McpToolMeta {
  description: string
  inputSchema: ZodRawShape
}

export class McpToolError extends Error {
  override readonly name = "McpToolError"
}

export const mcpToolMeta = tag<McpToolMeta>({ label: "mcp.tool.meta" })

export interface McpServerConfig {
  name: string
  version: string
  tools: readonly Lite.AnyFlow[]
}

export const mcpConfig = tag<McpServerConfig>({ label: "mcp.config" })

export const mcpServer = resource({
  name: "mcp.server",
  ownership: "boundary",
  deps: { config: tags.required(mcpConfig) },
  factory: (ctx, { config }) => {
    const instance = new McpServer({ name: config.name, version: config.version })
    const active = new Set<Promise<unknown>>()
    for (const flow of config.tools) {
      const name = flow.name
      if (!name) throw new McpToolError("MCP tool flow requires a name")
      const meta = mcpToolMeta.find(flow)
      if (!meta) throw new McpToolError(`MCP tool "${name}" is missing an mcpToolMeta tag`)
      instance.registerTool(name, { description: meta.description, inputSchema: meta.inputSchema }, async (args) => {
        const call = ctx.exec({ flow, rawInput: args })
        active.add(call)
        try {
          return toolResult(await call)
        } finally {
          active.delete(call)
        }
      })
    }
    ctx.cleanup(async () => {
      await instance.close()
      await Promise.allSettled(active)
    })
    return instance
  },
})

function toolResult(output: unknown): CallToolResult {
  return { content: [{ type: "text", text: encode(output) }] }
}

function encode(output: unknown): string {
  if (output === undefined) return ""
  if (typeof output === "string") return output
  return JSON.stringify(output, (_key, value) => (typeof value === "bigint" ? value.toString() : value))
}
