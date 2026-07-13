import { PassThrough } from "node:stream"
import { EventEmitter } from "node:events"
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process"
import { createScope, flow, preset, typed, type Lite } from "@pumped-fn/lite"
import { abortSignal, agent, currentAgent, currentTool, model, turn, type Model, type ModelRequest, type PromptInput } from "@pumped-fn/sdk"
import { expect, expectTypeOf, it } from "vitest"
import * as claudeModule from "../src/index"
import {
  claude,
  claudeConfig,
  claudeRun,
  claudeSession,
  claudeTurn,
  clock,
  engine,
  ClaudeShutdownError,
} from "../src/index"

const fake = flow({
  name: "claude.fake",
  parse: typed<PromptInput>(),
  factory: (ctx) => JSON.stringify({ content: `provider=claude prompt=${ctx.input.prompt.includes("Agent: planner")}`, stop: true }),
})

it("provides Claude through stable module handles", async () => {
  const target = agent({ name: "planner" })
  const scope = createScope({
    presets: [preset(claudeModule.run, fake)],
    tags: [claudeModule.provider, claudeModule.config(managedConfig())],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: target.turn, input: { prompt: "plan" } })).resolves.toMatchObject({
    content: "provider=claude prompt=true",
  })
  expectTypeOf(claudeModule.turn).toMatchTypeOf<Model>()

  await ctx.close()
  await scope.dispose()
})

it("can replace the model tag per context", async () => {
  const target = agent({ name: "planner" })
  const replacement: Model = flow({
    parse: typed<ModelRequest>(),
    factory: () => ({ content: "provider=fake", stop: true }),
  })
  const scope = createScope({
    presets: [preset(claudeRun, fake)],
    tags: [claude, claudeConfig(managedConfig())],
  })
  const claudeCtx = scope.createContext()
  const fakeCtx = scope.createContext({ tags: [model(replacement)] })

  await expect(claudeCtx.exec({ flow: target.turn, input: { prompt: "plan" } })).resolves.toMatchObject({
    content: "provider=claude prompt=true",
  })
  await expect(fakeCtx.exec({ flow: target.turn, input: { prompt: "plan" } })).resolves.toMatchObject({
    content: "provider=fake",
  })

  await claudeCtx.close()
  await fakeCtx.close()
  await scope.dispose()
})

it("resolves managed tools before the Claude request", async () => {
  const prompts: PromptInput[] = []
  const responses = [
    JSON.stringify({ content: "calling", stop: false, toolCalls: [{ name: "inspect", input: "claude" }] }),
    JSON.stringify({ content: "done", stop: true }),
  ]
  const fake = flow({
    name: "claude.managed-tools.fake",
    parse: typed<PromptInput>(),
    factory: (ctx) => {
      prompts.push(ctx.input)
      return responses.shift()!
    },
  })
  const inspect = currentTool({
    description: "Inspect input.",
    flow: flow({
      name: "inspect",
      parse: typed<string>(),
      factory: (ctx) => `tool:${ctx.input}`,
    }),
  })
  const managed = currentAgent({ name: "managed", tools: { inspect } })
  const run = turn({ agent: managed })
  const scope = createScope({
    presets: [preset(claudeRun, fake)],
    tags: [claude, claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()

  const result = await ctx.exec({ flow: run, input: { prompt: "run" } })

  expect(prompts[0]?.prompt).toContain("inspect")
  expect(prompts[1]?.prompt).toContain("tool:claude")
  expect(result.toolResults).toMatchObject([{ name: "inspect", output: "tool:claude" }])
  await ctx.close()
  await scope.dispose()
})

it("exposes aligned package-module handles without a facade", () => {
  expect(claudeModule.config).toBe(claudeConfig)
  expect(claudeModule.engine).toBe(engine)
  expect(claudeModule.run).toBe(claudeRun)
  expect(claudeModule.turn).toBe(claudeTurn)
  expect(claudeModule.provider).toBe(claude)
  expectTypeOf(claudeModule.engine).not.toBeAny()
})

it("exposes the static turn to run to boundary to engine graph", () => {
  expect(claudeTurn.deps).toMatchObject({ run: { flow: claudeRun } })
  expect(claudeRun.deps).toMatchObject({ session: claudeSession })
  expect(claudeSession.deps).toMatchObject({ engine })
})

it("runs sequential stream-json prompts through a scope-owned engine", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig({ roots: ["/tmp/extra"] }))],
  })
  const ctx = scope.createContext()

  const first = ctx.exec({ flow: claudeRun, input: { prompt: "first" } })
  const second = ctx.exec({ flow: claudeRun, input: { prompt: "second" } })
  await harness.writes(1)
  expect(harness.prompts).toEqual(["first"])

  harness.result("one")
  await expect(first).resolves.toBe("one")
  await harness.writes(2)
  expect(harness.prompts).toEqual(["first", "second"])

  harness.result("two")
  await expect(second).resolves.toBe("two")
  expect(harness.options).toMatchObject({ cwd: process.cwd() })
  expect(harness.options?.args).toEqual(expect.arrayContaining([
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--tools",
    "",
    "--permission-mode",
    "dontAsk",
    "--add-dir",
    "/tmp/extra",
  ]))

  await ctx.close()
  await scope.dispose()
  expect(harness.ends).toBe(1)
  expect(harness.live).toBe(false)
})

it("interrupts an active prompt and awaits child close", async () => {
  const harness = createHarness({ closeOnEnd: false, closeOnInterrupt: false })
  const controller = new AbortController()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext({ tags: [abortSignal(controller.signal)] })
  const prompt = ctx.exec({ flow: claudeRun, input: { prompt: "wait" } })
  const queued = ctx.exec({ flow: claudeRun, input: { prompt: "must-not-start" } })
  await harness.writes(1)

  controller.abort()
  await expect(prompt).rejects.toMatchObject({ name: "AbortError" })
  await expect(queued).rejects.toThrow("Claude session is closed")
  expect(harness.interrupts).toBe(1)
  expect(harness.prompts).toEqual(["wait"])

  let closed = false
  const close = ctx.close().then(() => {
    closed = true
  })
  await Promise.resolve()
  expect(closed).toBe(false)
  harness.close()
  await close
  await ctx.close()
  await scope.dispose()
  expect(harness.live).toBe(false)
})

it("requires config through the graph before the engine starts", async () => {
  const harness = createHarness()
  const scope = createScope({ presets: [preset(engine, harness.engine)] })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: claudeRun, input: { prompt: "blocked" } })).rejects.toThrow()
  expect(harness.options).toBeUndefined()

  await ctx.close()
  await scope.dispose()
})

it.each([
  [{ auth: { kind: "global" }, cwd: process.cwd(), roots: ["relative"], permission: "deny", shutdownTimeoutMs: 25 }, "roots must contain only absolute paths"],
  [{ auth: { kind: "global" }, cwd: "relative", roots: [], permission: "deny", shutdownTimeoutMs: 25 }, "cwd must be an absolute path"],
] as const)("fails closed on incomplete managed authority %#", async (value, message) => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(value)],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: claudeRun, input: { prompt: "blocked" } })).rejects.toThrow(message)
  expect(harness.options).toBeUndefined()

  await ctx.close()
  await scope.dispose()
})

it("requires a positive shutdown bound before the engine starts", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig({ shutdownTimeoutMs: 0 }))],
  })
  const ctx = scope.createContext()

  await expect(ctx.exec({ flow: claudeRun, input: { prompt: "blocked" } })).rejects.toThrow("shutdownTimeoutMs must be greater than zero")
  expect(harness.options).toBeUndefined()

  await ctx.close()
  await scope.dispose()
})

it("escalates graceful close to SIGKILL within the second bound", async () => {
  const harness = createHarness({ closeOnEnd: false, closeOnSignals: ["SIGKILL"] })
  const timers = createClock()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  await ctx.resolve(claudeSession)

  const close = ctx.close()
  await new Promise((resolve) => setImmediate(resolve))
  expect(harness.ends).toBe(1)
  await timers.advance()
  expect(harness.signals).toEqual(["SIGKILL"])
  await close
  await scope.dispose()
  expect(harness.live).toBe(false)
})

it("fails closed when the child ignores SIGKILL past the second bound", async () => {
  const harness = createHarness({ closeOnEnd: false, closeOnSignals: [] })
  const timers = createClock()
  const scope = createScope({
    presets: [preset(clock, timers.clock), preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  await ctx.resolve(claudeSession)

  const close = ctx.close()
  const rejected = expect(close).rejects.toBeInstanceOf(ClaudeShutdownError)
  await new Promise((resolve) => setImmediate(resolve))
  await timers.advance()
  await timers.advance()
  await rejected
  expect(harness.live).toBe(true)
  expect(harness.ends).toBe(1)
  expect(harness.signals).toEqual(["SIGKILL"])
  harness.close()
  await scope.dispose()
})

it("terminates exactly once across repeated context close and scope dispose", async () => {
  const harness = createHarness()
  const scope = createScope({
    presets: [preset(engine, harness.engine)],
    tags: [claudeConfig(managedConfig())],
  })
  const ctx = scope.createContext()
  await ctx.resolve(claudeSession)

  await ctx.close()
  await ctx.close()
  await scope.dispose()
  await scope.dispose()
  expect(harness.ends).toBe(1)
  expect(harness.signals).toEqual([])
})

function managedConfig(overrides: Partial<Parameters<typeof claudeConfig>[0]> = {}): Parameters<typeof claudeConfig>[0] {
  return {
    auth: { kind: "global" },
    cwd: process.cwd(),
    roots: [],
    permission: "deny",
    shutdownTimeoutMs: 25,
    ...overrides,
  }
}

function createHarness(options: { closeOnEnd?: boolean; closeOnInterrupt?: boolean; closeOnSignals?: NodeJS.Signals[] } = {}) {
  const input = new PassThrough()
  const output = new PassThrough()
  const error = new PassThrough()
  const prompts: string[] = []
  let spawned: { command: string; args: readonly string[]; cwd: string | URL | undefined } | undefined
  const signals: NodeJS.Signals[] = []
  let ends = 0
  let live = true
  let buffered = ""
  input.setEncoding("utf8")
  input.on("data", (chunk: string) => {
    buffered += chunk
    const lines = buffered.split("\n")
    buffered = lines.pop() ?? ""
    for (const line of lines) {
      const message = JSON.parse(line) as { message: { content: string } }
      prompts.push(message.message.content)
    }
  })
  const close = () => {
    if (!live) return
    live = false
    output.end()
    error.end()
    child.emit("close", 0, null)
  }
  const child = Object.assign(new EventEmitter(), {
    stdin: input,
    stdout: output,
    stderr: error,
    kill: (signal: NodeJS.Signals = "SIGTERM") => {
      signals.push(signal)
      const configured = options.closeOnSignals ?? (options.closeOnInterrupt === false ? [] : ["SIGINT", "SIGTERM", "SIGKILL"])
      if (configured.includes(signal)) close()
      return true
    },
  }) as unknown as ChildProcessWithoutNullStreams
  input.on("finish", () => {
    ends++
    if (options.closeOnEnd !== false) close()
  })
  const replacement = ((command: string, args: readonly string[], spawnOptions: SpawnOptionsWithoutStdio) => {
    spawned = { command, args, cwd: spawnOptions.cwd }
    return child
  }) as Lite.Utils.AtomValue<typeof engine>
  return {
    engine: replacement,
    prompts,
    result(value: string) {
      output.write(`${JSON.stringify({ type: "result", result: value, is_error: false })}\n`)
    },
    close,
    async writes(count: number) {
      while (prompts.length < count) await new Promise((resolve) => setImmediate(resolve))
    },
    get options() {
      return spawned
    },
    get interrupts() {
      return signals.filter((signal) => signal === "SIGINT").length
    },
    get signals() {
      return signals
    },
    get ends() {
      return ends
    },
    get live() {
      return live
    },
  }
}

function createClock() {
  let next = 0
  const timers = new Map<number, () => void>()
  const replacement: Lite.Utils.AtomValue<typeof clock> = {
    set(fn) {
      const token = next++
      timers.set(token, fn)
      return token
    },
    clear(token) {
      timers.delete(token)
    },
  }
  return {
    clock: replacement,
    async advance() {
      const entry = timers.entries().next().value
      if (!entry) throw new Error("No pending lifecycle bound")
      timers.delete(entry[0])
      entry[1]()
      await new Promise((resolve) => setImmediate(resolve))
    },
  }
}
