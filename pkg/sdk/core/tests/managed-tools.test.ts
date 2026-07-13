import { createScope, flow, resource, tag, tags, typed, type Lite } from "@pumped-fn/lite"
import { toJsonSchema } from "@valibot/to-json-schema"
import { describe, expect, it } from "vitest"
import * as v from "valibot"
import * as z from "zod"
import {
  agent,
  currentAgent,
  currentTool,
  model,
  step,
  ToolInputError,
  tool,
  turn,
  validation,
  type Model,
  type ModelRequest,
  type ModelResponse,
  type Step,
} from "../src/index"

const validationTag = validation.engine(validation.standard<z.ZodType>((schema) => z.toJSONSchema(schema)))
const valibotValidationTag = validation.engine(validation.standard<v.GenericSchema>((schema) => toJsonSchema(schema)))

function provider(response: (request: ModelRequest) => ModelResponse): Model {
  return flow({
    name: "test-model",
    parse: typed<ModelRequest>(),
    factory: (ctx) => response(ctx.input),
  })
}

async function close(scope: Lite.Scope, ctx: Lite.ExecutionContext) {
  await ctx.close()
  await scope.dispose()
}

describe("managed tools", () => {
  it("leaves legacy tool and agent unchanged", async () => {
    const legacy = tool({
      description: "Legacy tool.",
      flow: flow({
        name: "legacy-tool",
        parse: typed<string>(),
        factory: (ctx) => `legacy:${ctx.input}`,
      }),
    })
    const legacyAgent = agent({
      name: "legacy-agent",
      tools: [legacy],
      tags: [model(provider(() => ({ content: "done", stop: true })))],
    })
    const scope = createScope()
    const ctx = scope.createContext()

    expect(legacyAgent.turn).toBeDefined()
    await expect(ctx.exec({ flow: legacyAgent.turn, input: { prompt: "run" } })).resolves.toMatchObject({
      agentName: "legacy-agent",
      content: "done",
    })
    await close(scope, ctx)
  })

  it("resolves every tool before the model call", async () => {
    const resolved = new Set<string>()
    const ready = (name: string) => resource({
      ownership: "current",
      factory: () => {
        resolved.add(name)
        return name
      },
    })
    const first = currentTool({
      description: "First.",
      inputSchema: z.unknown(),
      flow: flow({ name: "first", parse: typed<unknown>(), factory: () => "first" }),
      deps: { ready: ready("first") },
    })
    const second = currentTool({
      description: "Second.",
      inputSchema: z.unknown(),
      flow: flow({ name: "second", parse: typed<unknown>(), factory: () => "second" }),
      deps: { ready: ready("second") },
    })
    const managed = currentAgent({ name: "managed", tools: { first, second } })
    let modelCalls = 0
    let advertised: readonly string[] = []
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider((request) => {
        modelCalls++
        expect([...resolved]).toEqual(["first", "second"])
        advertised = request.tools.map((item) => item.name)
        return { content: "ready", stop: true }
      }))],
    })
    const ctx = scope.createContext()

    await ctx.exec({ flow: run, input: { prompt: "run" } })

    expect(modelCalls).toBe(1)
    expect(advertised).toEqual(["first", "second"])
    await close(scope, ctx)
  })

  it("keeps the declared flow when runtime deps contain flow", async () => {
    const declared = flow({
      name: "declared",
      parse: typed<string>(),
      factory: (ctx) => `declared:${ctx.input}`,
    })
    const replacement = flow({
      name: "replacement",
      parse: typed<string>(),
      factory: (ctx) => `replacement:${ctx.input}`,
    })
    const deps = { marker: resource({ factory: () => "marker" }) }
    Reflect.set(deps, "flow", replacement)
    const selected = currentTool({
      name: "selected",
      description: "Selected.",
      inputSchema: z.string(),
      flow: declared,
      deps,
    })
    const managed = currentAgent({ name: "managed", tools: { selected } })
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => ({
        content: "calling",
        toolCalls: [{ name: "selected", input: "item" }],
      })))],
    })
    const ctx = scope.createContext()

    const result = await ctx.exec({ flow: run, input: { prompt: "run", maxRounds: 1 } })

    expect(result.toolResults).toMatchObject([{ name: "selected", output: "declared:item" }])
    await close(scope, ctx)
  })

  it("closes current-owned managed dependencies with the turn", async () => {
    const closed: string[] = []
    const managedDependency = (name: string) => resource({
      name,
      ownership: "current",
      factory: (ctx) => {
        ctx.cleanup(() => {
          closed.push(name)
        })
        return name
      },
    })
    const first = currentTool({
      description: "First.",
      inputSchema: z.unknown(),
      flow: flow({ name: "first", parse: typed<unknown>(), factory: () => "first" }),
      deps: { dependency: managedDependency("tool-dependency") },
    })
    const second = currentTool({
      description: "Second.",
      inputSchema: z.unknown(),
      flow: flow({ name: "second", parse: typed<unknown>(), factory: () => "second" }),
      deps: { dependency: managedDependency("agent-dependency") },
    })
    const managed = currentAgent({ name: "managed", tools: { first, second } })
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => ({ content: "done", stop: true })))],
    })
    const ctx = scope.createContext()

    await ctx.exec({ flow: run, input: { prompt: "run" } })

    expect([...closed].sort()).toEqual(["agent-dependency", "tool-dependency"])
    await close(scope, ctx)
  })

  it("does not call the model when a required policy tag is missing", async () => {
    const policy = tag<string>({ label: "policy" })
    const guarded = currentTool({
      description: "Guarded.",
      inputSchema: z.unknown(),
      flow: flow({ name: "guarded", parse: typed<unknown>(), factory: () => "ok" }),
      deps: { policy: tags.required(policy) },
    })
    const managed = currentAgent({ name: "managed", tools: { guarded } })
    let modelCalls = 0
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => {
        modelCalls++
        return { content: "unexpected", stop: true }
      }))],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: { prompt: "run" } })).rejects.toThrow("policy")
    expect(modelCalls).toBe(0)
    await close(scope, ctx)
  })

  it("requires an explicit validation engine before advertising tools", async () => {
    const inspect = currentTool({
      description: "Inspect.",
      inputSchema: z.object({ id: z.string() }),
      flow: flow({
        name: "inspect",
        parse: typed<{ id: string }>(),
        factory: (ctx) => ctx.input.id,
      }),
    })
    let modelCalls = 0
    const run = turn({ agent: currentAgent({ name: "managed", tools: { inspect } }) })
    const scope = createScope({
      tags: [model(provider(() => {
        modelCalls++
        return { content: "unexpected", stop: true }
      }))],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: { prompt: "run" } })).rejects.toThrow("agent.validation.engine")
    expect(modelCalls).toBe(0)
    await close(scope, ctx)
  })

  it("advertises and enforces the Zod input schema before tool execution", async () => {
    let executions = 0
    let advertised: unknown
    const inspect = currentTool({
      description: "Inspect.",
      inputSchema: z.object({ id: z.uuid() }),
      flow: flow({
        name: "inspect",
        parse: typed<{ id: string }>(),
        factory: (ctx) => {
          executions++
          return ctx.input.id
        },
      }),
    })
    const run = turn({ agent: currentAgent({ name: "managed", tools: { inspect } }) })
    const scope = createScope({
      tags: [validationTag, model(provider((request) => {
        advertised = request.tools[0]?.inputSchema
        return { content: "calling", toolCalls: [{ name: "inspect", input: { id: "not-a-uuid" } }] }
      }))],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: { prompt: "run" } })).rejects.toBeInstanceOf(ToolInputError)
    expect(advertised).toMatchObject({
      properties: { id: { format: "uuid", type: "string" } },
      required: ["id"],
      type: "object",
    })
    expect(executions).toBe(0)
    await close(scope, ctx)
  })

  it("switches to a Valibot engine at the scope seam", async () => {
    const sum = currentTool({
      description: "Add values.",
      inputSchema: v.object({ left: v.number(), right: v.number() }),
      flow: flow({
        name: "sum",
        parse: typed<{ left: number; right: number }>(),
        factory: (ctx) => ctx.input.left + ctx.input.right,
      }),
    })
    const run = turn({ agent: currentAgent({ name: "managed", tools: { sum } }) })
    const scope = createScope({
      tags: [valibotValidationTag, model(provider(() => ({
        content: "calling",
        toolCalls: [{ name: "sum", input: { left: 20, right: 22 } }],
      })))],
    })
    const ctx = scope.createContext()

    const result = await ctx.exec({ flow: run, input: { prompt: "run", maxRounds: 1 } })

    expect(result.toolResults[0]?.output).toBe(42)
    await close(scope, ctx)
  })

  it("dispatches the tool selected from the advertised snapshot", async () => {
    const selected = currentTool({
      name: "selected",
      description: "Selected.",
      inputSchema: z.object({ id: z.string() }),
      flow: flow({
        name: "selected-flow",
        parse: typed<{ id: string }>(),
        factory: (ctx) => `selected:${ctx.input.id}`,
      }),
    })
    const other = currentTool({
      name: "other",
      description: "Other.",
      inputSchema: z.unknown(),
      flow: flow({ name: "other-flow", parse: typed<unknown>(), factory: () => "other" }),
    })
    const managed = currentAgent({ name: "managed", tools: { selected, other } })
    const responses = [
      { content: "calling", toolCalls: [{ name: "selected", input: { id: "42" } }] },
      { content: "done", stop: true },
    ]
    let advertised: readonly string[] = []
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider((request) => {
        advertised = request.tools.map((item) => item.name)
        return responses[request.round] ?? responses[1]!
      }))],
    })
    const ctx = scope.createContext()

    const result = await ctx.exec({ flow: run, input: { prompt: "run" } })

    expect(advertised).toEqual(["selected", "other"])
    expect(result.toolResults).toMatchObject([{ name: "selected", output: "selected:42" }])
    await close(scope, ctx)
  })

  it("dispatches through the captured handle with the standard tool step envelope", async () => {
    const selected = currentTool({
      name: "selected",
      description: "Selected.",
      inputSchema: z.unknown(),
      flow: flow({
        name: "selected-flow",
        parse: typed<unknown>(),
        tags: [step({ timeoutMs: 17 })],
        factory: () => "selected",
      }),
    })
    const managed = currentAgent({ name: "managed", tools: { selected } })
    const observations: { name: string | undefined; step: Step | undefined }[] = []
    const observer: Lite.Extension = {
      name: "managed-tool-observer",
      wrapExec: async (next, _target, childCtx) => {
        if (childCtx.name === "selected") observations.push({ name: childCtx.name, step: childCtx.data.seekTag(step) })
        return next()
      },
    }
    const run = turn({ agent: managed })
    const scope = createScope({
      extensions: [observer],
      tags: [validationTag, model(provider(() => ({
        content: "calling",
        toolCalls: [{ name: "selected", input: "item" }],
      })))],
    })
    const ctx = scope.createContext()

    await ctx.exec({ flow: run, input: { prompt: "run", maxRounds: 1 } })

    expect(observations).toEqual([{ name: "selected", step: { workflow: true, kind: "tool", timeoutMs: 17 } }])
    await close(scope, ctx)
  })

  it("rejects duplicate resolved public tool names before freezing the snapshot", async () => {
    const first = currentTool({
      name: "same",
      description: "First.",
      inputSchema: z.unknown(),
      flow: flow({ name: "first", parse: typed<unknown>(), factory: () => "first" }),
    })
    const second = currentTool({
      name: "same",
      description: "Second.",
      inputSchema: z.unknown(),
      flow: flow({ name: "second", parse: typed<unknown>(), factory: () => "second" }),
    })
    const managed = currentAgent({ name: "managed", tools: { first, second } })
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => ({ content: "unexpected", stop: true })))],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: { prompt: "run" } })).rejects.toThrow(
      'Current agent "managed" has duplicate tool name "same"'
    )
    await close(scope, ctx)
  })

  it.each([
    ["skillCalls", { skillCalls: [{ name: "unsupported" }] }],
    ["subagentCalls", { subagentCalls: [{ name: "unsupported", input: { prompt: "nested" } }] }],
  ] as const)("rejects managed provider %s explicitly", async (_field, response) => {
    const managed = currentAgent({
      name: "managed",
      tools: {},
    })
    const run = turn({ agent: managed })
    const scope = createScope({ tags: [model(provider(() => ({ content: "unsupported", ...response })))] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: { prompt: "run" } })).rejects.toThrow(`does not support ${_field}`)
    await close(scope, ctx)
  })

  it("cleans current-owned managed dependencies after tool failure", async () => {
    let closed = 0
    const dependency = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.cleanup(() => {
          closed++
        })
        return "ready"
      },
    })
    const failing = currentTool({
      description: "Failing.",
      inputSchema: z.unknown(),
      flow: flow({
        name: "failing",
        parse: typed<unknown>(),
        factory: () => {
          throw new Error("tool failed")
        },
      }),
      deps: { dependency },
    })
    const managed = currentAgent({ name: "managed", tools: { failing } })
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => ({ content: "calling", toolCalls: [{ name: "failing", input: null }] })))],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: { prompt: "run" } })).rejects.toThrow("tool failed")
    expect(closed).toBe(1)
    await close(scope, ctx)
  })

  it("cleans current-owned managed dependencies when maxRounds ends on a tool call", async () => {
    let closed = 0
    const dependency = resource({
      ownership: "current",
      factory: (ctx) => {
        ctx.cleanup(() => {
          closed++
        })
        return "ready"
      },
    })
    const selected = currentTool({
      description: "Selected.",
      inputSchema: z.unknown(),
      flow: flow({ name: "selected", parse: typed<unknown>(), factory: () => "selected" }),
      deps: { dependency },
    })
    const managed = currentAgent({ name: "managed", tools: { selected } })
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => ({ content: "calling", toolCalls: [{ name: "selected", input: null }] })))],
    })
    const ctx = scope.createContext()

    await ctx.exec({ flow: run, input: { prompt: "run", maxRounds: 1 } })
    expect(closed).toBe(1)
    await close(scope, ctx)
  })

  it("uses backend tags from each execution context", async () => {
    const backend = tag<string>({ label: "backend" })
    const lookup = currentTool({
      description: "Lookup.",
      inputSchema: z.string(),
      flow: flow({
        name: "lookup",
        parse: typed<string>(),
        deps: { backend: tags.required(backend) },
        factory: (ctx, deps) => `${deps.backend}:${ctx.input}`,
      }),
    })
    const managed = currentAgent({ name: "managed", tools: { lookup } })
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => ({
        content: "lookup",
        toolCalls: [{ name: "lookup", input: "item" }],
      })))],
    })
    const first = scope.createContext({ tags: [backend("first")] })
    const second = scope.createContext({ tags: [backend("second")] })

    const firstResult = await first.exec({ flow: run, input: { prompt: "run", maxRounds: 1 } })
    const secondResult = await second.exec({ flow: run, input: { prompt: "run", maxRounds: 1 } })

    expect(firstResult.toolResults[0]?.output).toBe("first:item")
    expect(secondResult.toolResults[0]?.output).toBe("second:item")
    await first.close()
    await second.close()
    await scope.dispose()
  })

  it("does not let model input supply a required approval tag", async () => {
    const approval = tag<boolean>({ label: "approval" })
    const approved = currentTool({
      description: "Approved action.",
      inputSchema: z.object({ approved: z.boolean() }),
      flow: flow({
        name: "approved",
        parse: typed<{ approved: boolean }>(),
        deps: { approval: tags.required(approval) },
        factory: (ctx) => `approved:${ctx.input.approved}`,
      }),
    })
    const managed = currentAgent({ name: "managed", tools: { approved } })
    const run = turn({ agent: managed })
    const scope = createScope({
      tags: [validationTag, model(provider(() => ({
        content: "calling",
        toolCalls: [{ name: "approved", input: { approved: true } }],
      })))],
    })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: run, input: { prompt: "run" } })).rejects.toThrow("approval")
    await close(scope, ctx)
  })
})
