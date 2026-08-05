import { createScope, flow, tags } from "@pumped-fn/lite"
import { describe, expect, it } from "vitest"
import * as agent from "../src/agent"
import {
  CliWorkerError,
  ModelResponseParseError,
  abortSignal,
  extension,
  formatModelPrompt,
  model,
  parseModelResponse,
  runCli,
  step,
  workflow,
  workflowExtension,
  workflowRun,
  type WorkflowEventLog,
} from "../src/index"

describe("sdk public surface", () => {
  it("shares the model tag with the agent subpath", () => {
    expect(agent.fromModel.deps.provider.tag.key).toBe(model.key)
  })

  it("includes a canonically ordered tool schema in model prompts", () => {
    const prompt = formatModelPrompt({
      agentName: "analyst",
      instructions: "",
      messages: [],
      tools: [{
        name: "inspect",
        description: "Inspect data.",
        inputSchema: { properties: { "é": { type: "number" }, z: { type: "string" } }, type: "object" },
      }],
      skills: [],
      loadedSkills: [],
      subagents: [],
      round: 0,
    })

    expect(prompt).toContain(
      'Input schema: {"properties":{"z":{"type":"string"},"é":{"type":"number"}},"type":"object"}',
    )
  })

  it("reports malformed model responses instead of stopping silently", () => {
    expect(() => parseModelResponse("model returned plain text")).toThrowError(ModelResponseParseError)
    expect(() => parseModelResponse('{"content":broken,"toolCalls":[{"name":"inspect"}]}')).toThrowError(
      ModelResponseParseError,
    )
  })

  it("finds a valid response object without joining unrelated braces", () => {
    expect(parseModelResponse('prefix {not json} middle {"content":"done {now}","stop":false} suffix')).toEqual({
      content: "done {now}",
      stop: false,
    })
  })

  it("returns only successful CLI results and carries failures on CliWorkerError", async () => {
    await expect(runCli({
      command: process.execPath,
      args: ["-e", "process.stdout.write('ready')"],
    })).resolves.toEqual({ stdout: "ready", stderr: "", exitCode: 0, signal: null })

    const failed = runCli({ command: process.execPath, args: ["-e", "process.exit(7)"] })
    await expect(failed).rejects.toBeInstanceOf(CliWorkerError)
    await expect(failed).rejects.toMatchObject({ result: { exitCode: 7, signal: null } })
  })

  it("names the SDK extension when workflow ordering is wrong", async () => {
    const target = flow({ name: "sdk-order", factory: () => "ready" })
    const scope = createScope({ extensions: [extension()] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: target })).rejects.toThrow("sdk extension requires workflow extension to run first")
    await ctx.close({ ok: false, error: new Error("expected") })
    await scope.dispose()
  })

  it("shares one workflow context tag across workflow and SDK extensions", async () => {
    const log = {
      get: () => Promise.resolve(undefined),
      putPending: () => Promise.resolve(),
      putCompleted: () => Promise.resolve(),
      resolve: () => Promise.resolve(),
    } satisfies WorkflowEventLog
    const target = flow({
      name: "sdk-workflow-context",
      tags: [step({ remote: true })],
      deps: { context: tags.required(workflow) },
      factory: (_ctx, { context }) => `${context.taskId}:${context.runId}`,
    })
    const scope = createScope({
      extensions: [
        workflowExtension({ log }),
        extension({ remoteRunner: { run: (_event, next) => next() } }),
      ],
    })
    const ctx = scope.createContext({ tags: [workflowRun({ taskId: "task-1", runId: "run-1" })] })

    await expect(ctx.exec({ flow: target })).resolves.toBe("task-1:run-1")
    await ctx.close()
    await scope.dispose()
  })

  it("aborts the public signal when a workflow step times out", async () => {
    const log = {
      get: () => Promise.resolve(undefined),
      putPending: () => Promise.resolve(),
      putCompleted: () => Promise.resolve(),
      resolve: () => Promise.resolve(),
    } satisfies WorkflowEventLog
    let aborted = false
    const target = flow({
      name: "sdk-timeout",
      tags: [step({ workflow: true, timeoutMs: 5 })],
      deps: { signal: tags.required(abortSignal) },
      factory: (_ctx, { signal }) => new Promise<never>((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          aborted = true
          reject(signal.reason)
        }, { once: true })
      }),
    })
    const scope = createScope({ extensions: [workflowExtension({ log })] })
    const ctx = scope.createContext()

    await expect(ctx.exec({ flow: target })).rejects.toThrow("Workflow step timed out after 5ms")
    expect(aborted).toBe(true)
    await ctx.close({ ok: false, error: new Error("expected") })
    await scope.dispose()
  })
})
