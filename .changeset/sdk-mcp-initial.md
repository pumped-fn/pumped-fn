---
"@pumped-fn/sdk-mcp": minor
---

Add `@pumped-fn/sdk-mcp`: expose pumped-fn flows as an MCP server.

A flow carries an `mcpToolMeta` tag (description + Zod input shape) and is listed in
`mcpConfig`; the `mcpServer` boundary resource registers each with `@modelcontextprotocol/sdk`
and execs it per tool call, so every call runs inside the resolving scope with its presets and
trace. MCP validates arguments against each flow's `inputSchema` before the flow runs; a thrown
error maps to an `isError` result; cleanup closes the server and drains in-flight calls.
Transports (stdio / in-memory) are owned by the composition root.
