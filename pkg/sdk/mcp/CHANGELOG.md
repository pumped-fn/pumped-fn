# @pumped-fn/sdk-mcp

## 2.1.1

### Patch Changes

- 2e95323: Document exported interfaces and align callback registrations with Lite's explicit trailing-parameter contract. Compatible packages widen their peer ranges to include Lite 6 and the Lite React 3.0 release line.

## 2.1.0

### Minor Changes

- bafd22c: Add `@pumped-fn/sdk-mcp`: expose pumped-fn flows as an MCP server.

  A flow carries an `mcpToolMeta` tag (description + Zod input shape) and is listed in
  `mcpConfig`; the `mcpServer` boundary resource registers each with `@modelcontextprotocol/sdk`
  and execs it per tool call, so every call runs inside the resolving scope with its presets and
  trace. MCP validates arguments against each flow's `inputSchema` before the flow runs; a thrown
  error maps to an `isError` result; cleanup closes the server and drains in-flight calls.
  Transports (stdio / in-memory) are owned by the composition root.

## 2.0.0

- Initial release: expose @pumped-fn/lite flows as MCP tools via the `mcpServer` resource, `mcpConfig` tag, and `mcpToolMeta` schema tag.
